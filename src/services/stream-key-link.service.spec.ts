import { BadRequestException, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import { StreamPlatform } from 'src/enums/stream-platform.enum';
import {
  LINK_CODE_ALPHABET,
  LINK_CODE_TTL_SECONDS,
  StreamKeyLinkService,
} from './stream-key-link.service';
import { StreamKeyService } from './stream-key.service';

/** Just enough of ioredis for the service: GET, and SET with EX/NX/KEEPTTL. */
function fakeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    store,
    ttls,
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string, ...args: (string | number)[]) => {
      if (args.includes('NX') && store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      const ex = args.indexOf('EX');
      if (ex >= 0) ttls.set(key, Number(args[ex + 1]));
      return Promise.resolve('OK');
    }),
  };
}

describe('StreamKeyLinkService', () => {
  const tv = 'auth0|owner';
  const stranger = 'auth0|someone-else';

  let redis: ReturnType<typeof fakeRedis>;
  let streamKeys: { saveStreamKey: jest.Mock };
  let service: StreamKeyLinkService;

  beforeEach(() => {
    redis = fakeRedis();
    streamKeys = { saveStreamKey: jest.fn().mockResolvedValue({}) };
    service = new StreamKeyLinkService(
      redis as unknown as Redis,
      streamKeys as unknown as StreamKeyService,
    );
  });

  it('makes a 4-character code from the TV-safe alphabet that expires in 10 minutes', async () => {
    const { code, platform, expiresInSeconds } = await service.create(
      tv,
      StreamPlatform.KICK,
    );

    expect(code).toHaveLength(4);
    expect([...code].every((c) => LINK_CODE_ALPHABET.includes(c))).toBe(true);
    expect(platform).toBe(StreamPlatform.KICK);
    expect(expiresInSeconds).toBe(LINK_CODE_TTL_SECONDS);
    expect(redis.ttls.get(`stream-key-link:${code}`)).toBe(
      LINK_CODE_TTL_SECONDS,
    );
  });

  it('rejects an unknown platform', async () => {
    await expect(
      service.create(tv, 'myspace' as StreamPlatform),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tells the phone which platform a code is for, and whether it needs a URL', async () => {
    const kick = await service.create(tv, StreamPlatform.KICK);
    const youtube = await service.create(tv, StreamPlatform.YOUTUBE);

    await expect(service.lookup(tv, kick.code)).resolves.toMatchObject({
      platform: StreamPlatform.KICK,
      requiresUrl: true,
      status: 'waiting',
    });
    await expect(service.lookup(tv, youtube.code)).resolves.toMatchObject({
      platform: StreamPlatform.YOUTUBE,
      requiresUrl: false,
    });
  });

  it('accepts a code typed in lower case or with spaces', async () => {
    const { code } = await service.create(tv, StreamPlatform.TWITCH);
    const typed = ` ${code.slice(0, 2).toLowerCase()} ${code.slice(2)} `;

    await expect(service.lookup(tv, typed)).resolves.toMatchObject({
      code,
      platform: StreamPlatform.TWITCH,
    });
  });

  it("treats another account's code exactly like a missing one", async () => {
    const { code } = await service.create(tv, StreamPlatform.KICK);

    await expect(service.lookup(stranger, code)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.submit(stranger, code, 'key', 'rtmps://x'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.status(stranger, code)).resolves.toEqual({
      status: 'expired',
    });
    expect(streamKeys.saveStreamKey).not.toHaveBeenCalled();
  });

  it("saves the key for the code's platform and marks the code done for the TV", async () => {
    const { code } = await service.create(tv, StreamPlatform.KICK);

    await expect(
      service.submit(
        tv,
        code,
        '  sk_live_123  ',
        ' rtmps://ingest.kick.com/app ',
      ),
    ).resolves.toEqual({
      platform: StreamPlatform.KICK,
    });

    expect(streamKeys.saveStreamKey).toHaveBeenCalledWith(
      tv,
      StreamPlatform.KICK,
      'sk_live_123',
      'rtmps://ingest.kick.com/app',
    );
    await expect(service.status(tv, code)).resolves.toEqual({ status: 'done' });
    // Updating the record keeps the code's remaining lifetime.
    expect(redis.set).toHaveBeenLastCalledWith(
      `stream-key-link:${code}`,
      expect.any(String),
      'KEEPTTL',
    );
  });

  it('leaves the code waiting when the key is rejected', async () => {
    const { code } = await service.create(tv, StreamPlatform.KICK);
    streamKeys.saveStreamKey.mockRejectedValue(
      new BadRequestException('streamUrl is required for kick'),
    );

    await expect(
      service.submit(tv, code, 'sk_live_123'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.status(tv, code)).resolves.toEqual({
      status: 'waiting',
    });
  });

  it('reports an unknown or malformed code as expired to the TV and not found to the phone', async () => {
    await expect(service.status(tv, 'ZZZZ')).resolves.toEqual({
      status: 'expired',
    });
    await expect(service.lookup(tv, '0O1I')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.lookup(tv, 'TOOLONG')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('never reuses a code that is still live', async () => {
    const taken = await service.create(tv, StreamPlatform.KICK);
    // Hand out the taken code first, then a free one.
    const codes = [taken.code, 'WXYZ' === taken.code ? 'ABCD' : 'WXYZ'];
    class Forced extends StreamKeyLinkService {
      protected newCode(): string {
        return codes.shift() ?? 'ABCD';
      }
    }
    const forced = new Forced(
      redis as unknown as Redis,
      streamKeys as unknown as StreamKeyService,
    );

    const next = await forced.create(stranger, StreamPlatform.TWITCH);

    // It did try the taken code (and was refused) before moving on.
    expect(
      redis.set.mock.calls.filter(
        (c) => c[0] === `stream-key-link:${taken.code}`,
      ),
    ).toHaveLength(2);
    expect(next.code).not.toBe(taken.code);
    await expect(service.lookup(tv, taken.code)).resolves.toMatchObject({
      platform: StreamPlatform.KICK,
    });
  });
});
