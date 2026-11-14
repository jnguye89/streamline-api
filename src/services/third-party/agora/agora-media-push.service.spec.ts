import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

import {
  AgoraMediaPushService,
  sideBySideLayout,
} from './agora-media-push.service';
import { AgoraTokenService } from './agora-token.service';

interface ConverterBody {
  converter: {
    name: string;
    rtmpUrl: string;
    idleTimeout: number;
    jitterBufferSizeMs: number;
    transcodeOptions: {
      rtcChannel: string;
      audioOptions: { rtcStreamUids?: number[] };
      videoOptions: { layout: unknown[] } & Record<string, unknown>;
    };
  };
}

describe('AgoraMediaPushService', () => {
  const rtmpUrl = 'rtmp://live.twitch.tv/app/live_secret_key';

  let http: { post: jest.Mock; delete: jest.Mock; patch: jest.Mock };
  let service: AgoraMediaPushService;

  async function buildService(): Promise<AgoraMediaPushService> {
    const module = await Test.createTestingModule({
      providers: [
        AgoraMediaPushService,
        { provide: HttpService, useValue: http },
        {
          provide: AgoraTokenService,
          useValue: { createBasicAuthToken: () => 'basic-token' },
        },
      ],
    }).compile();
    return module.get(AgoraMediaPushService);
  }

  beforeEach(async () => {
    process.env.AGORA_APP_ID = 'app-id';
    delete process.env.AGORA_MEDIA_PUSH_JITTER_BUFFER_MS;
    http = { post: jest.fn(), delete: jest.fn(), patch: jest.fn() };
    service = await buildService();
  });

  it('creates a transcoding converter for the host UID', async () => {
    http.post.mockReturnValue(
      of({ data: { converter: { id: 'converter-1', state: 'connecting' } } }),
    );

    const converter = await service.createConverter({
      name: 'host_abc_twitch_1',
      channelName: 'host-abc',
      hostUid: 42,
      rtmpUrl,
      region: 'na',
    });

    expect(converter.id).toBe('converter-1');
    const [url, body, config] = http.post.mock.calls[0] as [
      string,
      ConverterBody,
      { headers: Record<string, string> },
    ];
    expect(url).toBe(
      'https://api.agora.io/na/v1/projects/app-id/rtmp-converters',
    );
    expect(config.headers.Authorization).toBe('Basic basic-token');
    expect(body.converter).toEqual(
      expect.objectContaining({
        name: 'host_abc_twitch_1',
        rtmpUrl,
        idleTimeout: 60,
        jitterBufferSizeMs: 500,
      }),
    );
    const { rtcChannel, audioOptions, videoOptions } =
      body.converter.transcodeOptions;
    expect(rtcChannel).toBe('host-abc');
    // Everyone's audio is mixed, so podcast guests who join later are heard.
    expect(audioOptions).not.toHaveProperty('rtcStreamUids');
    expect(videoOptions).toEqual(
      expect.objectContaining({
        canvas: { width: 1280, height: 720 },
        codec: 'H.264',
        frameRate: 30,
        gop: 60,
      }),
    );
    expect(videoOptions.layout).toEqual([
      expect.objectContaining({
        rtcStreamUid: 42,
        region: { xPos: 0, yPos: 0, zIndex: 1, width: 1280, height: 720 },
      }),
    ]);
  });

  it('tiles guests already on the call beside the host', async () => {
    http.post.mockReturnValue(of({ data: { converter: { id: 'c' } } }));

    await service.createConverter({
      name: 'n',
      channelName: 'host-abc',
      hostUid: 42,
      guestUids: [7],
      rtmpUrl,
      region: 'na',
    });

    const [, body] = http.post.mock.calls[0] as [string, ConverterBody];
    expect(body.converter.transcodeOptions.videoOptions.layout).toEqual([
      expect.objectContaining({ rtcStreamUid: 42 }),
      expect.objectContaining({ rtcStreamUid: 7 }),
    ]);
  });

  it('updates only the layout of a running converter', async () => {
    http.patch.mockReturnValue(of({ data: {} }));

    await service.updateLayout('converter-1', 'eu', [42, 7, 9], 12);

    const [url, body, config] = http.patch.mock.calls[0] as [
      string,
      {
        converter: {
          transcodeOptions: { videoOptions: { layout: unknown[] } };
        };
        fields: string;
      },
      { params: Record<string, number> },
    ];
    expect(url).toBe(
      'https://api.agora.io/eu/v1/projects/app-id/rtmp-converters/converter-1',
    );
    expect(config.params).toEqual({ sequence: 12 });
    expect(body.fields).toBe('transcodeOptions.videoOptions.layout');
    expect(body.converter.transcodeOptions.videoOptions.layout).toHaveLength(3);
  });

  it('rounds the jitter buffer up to 100ms steps and caps it at 1s', async () => {
    for (const [configured, sent] of [
      ['250', 300],
      ['5000', 1000],
    ] as const) {
      process.env.AGORA_MEDIA_PUSH_JITTER_BUFFER_MS = configured;
      const configuredService = await buildService();
      http.post.mockReturnValue(of({ data: { converter: { id: 'c' } } }));

      await configuredService.createConverter({
        name: 'n',
        channelName: 'c',
        hostUid: 1,
        rtmpUrl,
        region: 'na',
      });

      const [, body] = http.post.mock.calls.at(-1) as [string, ConverterBody];
      expect(body.converter.jitterBufferSizeMs).toBe(sent);
    }
  });

  it('reports Agora errors without leaking the stream key', async () => {
    http.post.mockReturnValue(
      throwError(() =>
        Object.assign(new Error(`Request failed: ${rtmpUrl}`), {
          response: { status: 403, data: { message: 'Media Push disabled' } },
        }),
      ),
    );

    const error = await service
      .createConverter({
        name: 'n',
        channelName: 'c',
        hostUid: 1,
        rtmpUrl,
        region: 'na',
      })
      .catch((e: Error) => e);

    expect(error.message).toBe(
      'Agora Media Push create failed: HTTP 403: Media Push disabled',
    );
    expect(error.message).not.toContain('live_secret_key');
  });

  it('treats deleting an already-gone converter as success', async () => {
    http.delete.mockReturnValue(
      throwError(() => ({ response: { status: 404 } })),
    );

    await expect(
      service.deleteConverter('converter-1', 'eu'),
    ).resolves.toBeUndefined();
    const [url] = http.delete.mock.calls[0] as [string];
    expect(url).toBe(
      'https://api.agora.io/eu/v1/projects/app-id/rtmp-converters/converter-1',
    );
  });
});

describe('sideBySideLayout', () => {
  const regions = (uids: number[]) =>
    sideBySideLayout(uids, 1280, 720).map((r) => ({
      uid: r.rtcStreamUid,
      ...r.region,
      fillMode: r.fillMode,
    }));

  it('letterboxes the host alone across the whole canvas', () => {
    expect(regions([1])).toEqual([
      {
        uid: 1,
        xPos: 0,
        yPos: 0,
        zIndex: 1,
        width: 1280,
        height: 720,
        fillMode: 'fit',
      },
    ]);
  });

  it('splits two people into halves, host on the left, filling each', () => {
    expect(regions([1, 2])).toEqual([
      expect.objectContaining({ uid: 1, xPos: 0, width: 640, height: 720 }),
      expect.objectContaining({ uid: 2, xPos: 640, width: 640, height: 720 }),
    ]);
    expect(regions([1, 2]).every((r) => r.fillMode === 'fill')).toBe(true);
  });

  it('covers the canvas exactly in thirds, leftover pixels going last', () => {
    const three = regions([1, 2, 3]);
    expect(three.map((r) => r.width)).toEqual([426, 426, 428]);
    expect(three[2].xPos + three[2].width).toBe(1280);
  });

  it('puts four or five people in two rows, three on top', () => {
    const five = regions([1, 2, 3, 4, 5]);
    expect(five.map((r) => r.yPos)).toEqual([0, 0, 0, 360, 360]);
    expect(five.slice(3).map((r) => r.width)).toEqual([640, 640]);
    expect(regions([1, 2, 3, 4]).map((r) => r.yPos)).toEqual([0, 0, 0, 360]);
  });

  it('never tiles more than five people', () => {
    expect(regions([1, 2, 3, 4, 5, 6])).toHaveLength(5);
  });
});
