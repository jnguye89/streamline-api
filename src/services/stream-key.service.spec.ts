import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StreamKey } from 'src/entity/stream-key.entity';
import { StreamPlatform } from 'src/enums/stream-platform.enum';
import { StreamKeyRepository } from 'src/repositories/stream-key.repository';
import { StreamKeyService } from './stream-key.service';

describe('StreamKeyService: on or off for the next live', () => {
  const userId = 'auth0|streamer';
  let repo: {
    setEnabled: jest.Mock;
    upsert: jest.Mock;
    findAllByUserId: jest.Mock;
  };
  let service: StreamKeyService;

  beforeEach(() => {
    repo = {
      setEnabled: jest.fn(),
      upsert: jest.fn(),
      findAllByUserId: jest.fn(),
    };
    service = new StreamKeyService(repo as unknown as StreamKeyRepository);
  });

  it('switches a saved key off and on', async () => {
    repo.setEnabled.mockImplementation(
      (_u: string, platform: StreamPlatform, enabled: boolean) =>
        Promise.resolve({ userId, platform, enabled } as StreamKey),
    );

    await expect(
      service.setEnabled(userId, StreamPlatform.TWITCH, false),
    ).resolves.toMatchObject({
      enabled: false,
    });
    await expect(
      service.setEnabled(userId, StreamPlatform.TWITCH, true),
    ).resolves.toMatchObject({
      enabled: true,
    });
    expect(repo.setEnabled).toHaveBeenCalledWith(
      userId,
      StreamPlatform.TWITCH,
      false,
    );
  });

  it('says so when there is no key to switch', async () => {
    repo.setEnabled.mockResolvedValue(null);

    await expect(
      service.setEnabled(userId, StreamPlatform.KICK, true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only takes a real true or false', async () => {
    for (const bad of ['false', 0, undefined, null]) {
      await expect(
        service.setEnabled(userId, StreamPlatform.KICK, bad),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(repo.setEnabled).not.toHaveBeenCalled();
  });

  it('rejects an unknown platform', async () => {
    await expect(
      service.setEnabled(userId, 'myspace' as StreamPlatform, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
