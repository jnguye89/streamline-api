import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { Multistream } from 'src/entity/multistream.entity';
import { StreamPlatform } from 'src/enums/stream-platform.enum';
import { MultistreamRepository } from 'src/repositories/multistream.repository';
import { StreamKeyRepository } from 'src/repositories/stream-key.repository';
import { MultistreamService } from './multistream.service';
import { AgoraMediaPushService } from './third-party/agora/agora-media-push.service';

describe('MultistreamService', () => {
  const channelName = 'host-abc123';
  const userId = 'auth0|streamer';
  const hostUid = 4242;

  let rows: Multistream[];
  let multistreamRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findActiveByChannelName: jest.Mock;
  };
  let streamKeyRepo: { findAllByUserId: jest.Mock };
  let mediaPush: {
    region: string;
    createConverter: jest.Mock;
    deleteConverter: jest.Mock;
  };
  let service: MultistreamService;

  beforeEach(async () => {
    rows = [];
    multistreamRepo = {
      create: jest.fn((values: Partial<Multistream>) => {
        const row = { id: rows.length + 1, ...values } as Multistream;
        rows.push(row);
        return Promise.resolve(row);
      }),
      save: jest.fn((row: Multistream) => Promise.resolve(row)),
      findActiveByChannelName: jest.fn((name: string) =>
        Promise.resolve(
          rows.filter(
            (row) =>
              row.channelName === name &&
              (row.status === 'starting' || row.status === 'active'),
          ),
        ),
      ),
    };
    streamKeyRepo = {
      findAllByUserId: jest
        .fn()
        .mockResolvedValue([
          { userId, platform: StreamPlatform.TWITCH, streamKey: ' live_123 ' },
        ]),
    };
    mediaPush = {
      region: 'na',
      createConverter: jest.fn().mockResolvedValue({ id: 'converter-1' }),
      deleteConverter: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        MultistreamService,
        { provide: MultistreamRepository, useValue: multistreamRepo },
        { provide: StreamKeyRepository, useValue: streamKeyRepo },
        { provide: AgoraMediaPushService, useValue: mediaPush },
      ],
    }).compile();
    service = module.get(MultistreamService);
  });

  describe('parsePlatforms', () => {
    it('treats a missing list as no multistream', () => {
      expect(service.parsePlatforms(undefined)).toEqual([]);
    });

    it('de-duplicates supported platforms', () => {
      expect(service.parsePlatforms(['twitch', 'twitch'])).toEqual([
        StreamPlatform.TWITCH,
      ]);
    });

    it('rejects unsupported platforms and non-arrays', () => {
      expect(service.parsePlatforms(['twitch', 'kick'])).toEqual([
        StreamPlatform.TWITCH,
        StreamPlatform.KICK,
      ]);
      expect(() => service.parsePlatforms(['rumble'])).toThrow(
        BadRequestException,
      );
      expect(() => service.parsePlatforms('twitch')).toThrow(
        BadRequestException,
      );
    });
  });

  it('pushes the host to Twitch with the saved stream key', async () => {
    const result = await service.start(channelName, userId, hostUid, [
      StreamPlatform.TWITCH,
    ]);

    expect(result).toEqual([
      { platform: StreamPlatform.TWITCH, status: 'active' },
    ]);
    expect(mediaPush.createConverter).toHaveBeenCalledWith(
      expect.objectContaining({
        channelName,
        hostUid,
        region: 'na',
        rtmpUrl: 'rtmp://live.twitch.tv/app/live_123',
      }),
    );
    const [{ name }] = mediaPush.createConverter.mock.calls[0] as [
      { name: string },
    ];
    expect(name).toMatch(/^host_abc123_twitch_[a-z0-9]+$/);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        converterId: 'converter-1',
        status: 'active',
      }),
    );
  });

  it('reports a missing stream key without calling Agora', async () => {
    streamKeyRepo.findAllByUserId.mockResolvedValue([]);

    const result = await service.start(channelName, userId, hostUid, [
      StreamPlatform.TWITCH,
    ]);

    expect(result).toEqual([
      {
        platform: StreamPlatform.TWITCH,
        status: 'error',
        error: 'No Twitch stream key is saved',
      },
    ]);
    expect(mediaPush.createConverter).not.toHaveBeenCalled();
  });

  it('pushes to Kick using the saved per-account ingest URL', async () => {
    streamKeyRepo.findAllByUserId.mockResolvedValue([
      {
        userId,
        platform: StreamPlatform.KICK,
        streamKey: 'sk_us-west-2_abc',
        streamUrl:
          'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/',
      },
    ]);

    const result = await service.start(channelName, userId, hostUid, [
      StreamPlatform.KICK,
    ]);

    expect(result).toEqual([
      { platform: StreamPlatform.KICK, status: 'active' },
    ]);
    expect(mediaPush.createConverter).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('_kick_') as string,
        rtmpUrl:
          'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/sk_us-west-2_abc',
      }),
    );
  });

  it('reports a Kick key saved without its stream URL', async () => {
    streamKeyRepo.findAllByUserId.mockResolvedValue([
      { userId, platform: StreamPlatform.KICK, streamKey: 'sk_abc' },
    ]);

    const result = await service.start(channelName, userId, hostUid, [
      StreamPlatform.KICK,
    ]);

    expect(result).toEqual([
      {
        platform: StreamPlatform.KICK,
        status: 'error',
        error: 'No Kick stream URL is saved',
      },
    ]);
    expect(mediaPush.createConverter).not.toHaveBeenCalled();
  });

  it('starts one converter per platform and reports each separately', async () => {
    streamKeyRepo.findAllByUserId.mockResolvedValue([
      { userId, platform: StreamPlatform.TWITCH, streamKey: 'live_123' },
      {
        userId,
        platform: StreamPlatform.KICK,
        streamKey: 'sk_abc',
        streamUrl: 'rtmps://x.global-contribute.live-video.net:443/app',
      },
    ]);
    mediaPush.createConverter
      .mockResolvedValueOnce({ id: 'converter-1' })
      .mockResolvedValueOnce({ id: 'converter-2' });

    const result = await service.start(channelName, userId, hostUid, [
      StreamPlatform.TWITCH,
      StreamPlatform.KICK,
    ]);

    expect(result).toEqual([
      { platform: StreamPlatform.TWITCH, status: 'active' },
      { platform: StreamPlatform.KICK, status: 'active' },
    ]);
    expect(mediaPush.createConverter).toHaveBeenCalledTimes(2);
    expect(rows.map((row) => [row.platform, row.converterId])).toEqual([
      [StreamPlatform.TWITCH, 'converter-1'],
      [StreamPlatform.KICK, 'converter-2'],
    ]);

    await service.stopAll(channelName);
    expect(mediaPush.deleteConverter).toHaveBeenCalledTimes(2);
    expect(rows.every((row) => row.status === 'stopped')).toBe(true);
  });

  it('reports an Agora failure instead of throwing', async () => {
    mediaPush.createConverter.mockRejectedValue(
      new Error('Agora Media Push create failed: HTTP 403'),
    );

    const result = await service.start(channelName, userId, hostUid, [
      StreamPlatform.TWITCH,
    ]);

    expect(result).toEqual([
      {
        platform: StreamPlatform.TWITCH,
        status: 'error',
        error: 'Could not start streaming to Twitch',
      },
    ]);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        status: 'error',
        errorMessage: 'Agora Media Push create failed: HTTP 403',
      }),
    );
  });

  it('deletes the converter when its id cannot be saved', async () => {
    multistreamRepo.save.mockRejectedValueOnce(new Error('db down'));

    const result = await service.start(channelName, userId, hostUid, [
      StreamPlatform.TWITCH,
    ]);

    expect(result[0].status).toBe('error');
    expect(mediaPush.deleteConverter).toHaveBeenCalledWith('converter-1', 'na');
  });

  it('stops every active restream of the channel', async () => {
    await service.start(channelName, userId, hostUid, [StreamPlatform.TWITCH]);

    await service.stopAll(channelName);

    expect(mediaPush.deleteConverter).toHaveBeenCalledWith('converter-1', 'na');
    expect(rows[0].status).toBe('stopped');
  });

  it('keeps a restream active when Agora refuses the delete, then retries', async () => {
    await service.start(channelName, userId, hostUid, [StreamPlatform.TWITCH]);
    mediaPush.deleteConverter.mockRejectedValueOnce(new Error('HTTP 500'));

    await expect(service.stopAll(channelName)).resolves.toBeUndefined();
    expect(rows[0].status).toBe('active');

    await service.stopAll(channelName);
    expect(rows[0].status).toBe('stopped');
  });

  it('replaces a leftover restream when the channel goes live again', async () => {
    await service.start(channelName, userId, hostUid, [StreamPlatform.TWITCH]);
    mediaPush.createConverter.mockResolvedValue({ id: 'converter-2' });

    await service.start(channelName, userId, hostUid, [StreamPlatform.TWITCH]);

    expect(mediaPush.deleteConverter).toHaveBeenCalledWith('converter-1', 'na');
    expect(rows.map((row) => row.status)).toEqual(['stopped', 'active']);
  });
});
