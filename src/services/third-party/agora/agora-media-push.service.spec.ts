import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

import { AgoraMediaPushService } from './agora-media-push.service';
import { AgoraTokenService } from './agora-token.service';

interface ConverterBody {
  converter: {
    name: string;
    rtmpUrl: string;
    idleTimeout: number;
    jitterBufferSizeMs: number;
    transcodeOptions: {
      rtcChannel: string;
      audioOptions: { rtcStreamUids: number[] };
      videoOptions: { layout: unknown[] } & Record<string, unknown>;
    };
  };
}

describe('AgoraMediaPushService', () => {
  const rtmpUrl = 'rtmp://live.twitch.tv/app/live_secret_key';

  let http: { post: jest.Mock; delete: jest.Mock };
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
    http = { post: jest.fn(), delete: jest.fn() };
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
    expect(audioOptions.rtcStreamUids).toEqual([42]);
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
