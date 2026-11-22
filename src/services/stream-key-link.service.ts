import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { randomInt } from 'crypto';
import { StreamPlatform } from 'src/enums/stream-platform.enum';
import { StreamKeyService } from './stream-key.service';

/** How long a code shown on the TV stays usable. */
export const LINK_CODE_TTL_SECONDS = 10 * 60;

/** Letters and digits that can't be mistaken for each other on a TV (no 0/O, 1/I). */
export const LINK_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const LINK_CODE_LENGTH = 4;

const KEY_PREFIX = 'stream-key-link:';
const MAX_CREATE_ATTEMPTS = 10;

const PLATFORMS_REQUIRING_URL = new Set<StreamPlatform>([
  StreamPlatform.KICK,
  StreamPlatform.RUMBLE,
]);

export type LinkStatus = 'waiting' | 'done';

interface LinkRecord {
  userId: string;
  platform: StreamPlatform;
  status: LinkStatus;
}

/**
 * Sending a simulcast stream key from a phone to the TV.
 *
 * The TV asks for a short code for one platform; the phone (signed in to the same account)
 * looks the code up, sends the key, and the TV sees the code turn "done".
 *
 * A code only ever works for the account that made it: any other account gets "not found",
 * the same answer as for a code that doesn't exist, so a code read off someone's screen is
 * useless to anyone else. Codes live in Redis and expire on their own.
 */
@Injectable()
export class StreamKeyLinkService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly streamKeys: StreamKeyService,
  ) {}

  /** TV: a fresh code for this account and platform. */
  async create(
    userId: string,
    platform: StreamPlatform,
  ): Promise<{
    code: string;
    platform: StreamPlatform;
    expiresInSeconds: number;
  }> {
    if (!Object.values(StreamPlatform).includes(platform)) {
      throw new BadRequestException(`Unsupported platform: ${platform}`);
    }
    const record: LinkRecord = { userId, platform, status: 'waiting' };
    for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
      const code = this.newCode();
      // NX: never overwrite a code someone else is still using.
      const ok = await this.redis.set(
        KEY_PREFIX + code,
        JSON.stringify(record),
        'EX',
        LINK_CODE_TTL_SECONDS,
        'NX',
      );
      if (ok === 'OK')
        return { code, platform, expiresInSeconds: LINK_CODE_TTL_SECONDS };
    }
    throw new Error('Could not find a free link code');
  }

  /** Phone: which platform a code is for, and whether it needs a stream URL. */
  async lookup(
    userId: string,
    code: string,
  ): Promise<{
    code: string;
    platform: StreamPlatform;
    requiresUrl: boolean;
    status: LinkStatus;
  }> {
    const normalized = normalizeCode(code);
    const record = await this.find(userId, normalized);
    return {
      code: normalized,
      platform: record.platform,
      requiresUrl: PLATFORMS_REQUIRING_URL.has(record.platform),
      status: record.status,
    };
  }

  /** Phone: save the key for the code's platform and mark the code done for the TV. */
  async submit(
    userId: string,
    code: string,
    streamKey: string,
    streamUrl?: string,
  ): Promise<{ platform: StreamPlatform }> {
    const normalized = normalizeCode(code);
    const record = await this.find(userId, normalized);

    await this.streamKeys.saveStreamKey(
      userId,
      record.platform,
      streamKey?.trim(),
      streamUrl?.trim() || undefined,
    );

    // Keep the remaining lifetime so the TV can still read "done".
    const done: LinkRecord = { ...record, status: 'done' };
    await this.redis.set(
      KEY_PREFIX + normalized,
      JSON.stringify(done),
      'KEEPTTL',
    );
    return { platform: record.platform };
  }

  /** TV: has the phone sent the key yet? "expired" once the code is gone. */
  async status(
    userId: string,
    code: string,
  ): Promise<{ status: LinkStatus | 'expired' }> {
    const record = await this.read(normalizeCode(code));
    if (!record || record.userId !== userId) return { status: 'expired' };
    return { status: record.status };
  }

  /** A random code. Its own method so tests can force a collision. */
  protected newCode(): string {
    let code = '';
    for (let i = 0; i < LINK_CODE_LENGTH; i++) {
      code += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
    }
    return code;
  }

  private async find(userId: string, code: string): Promise<LinkRecord> {
    const record = await this.read(code);
    // Someone else's code reads exactly like a missing one.
    if (!record || record.userId !== userId) {
      throw new NotFoundException(
        'That code has expired or is not for this account',
      );
    }
    return record;
  }

  private async read(code: string): Promise<LinkRecord | null> {
    if (!isWellFormed(code)) return null;
    const raw = await this.redis.get(KEY_PREFIX + code);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LinkRecord;
    } catch {
      return null;
    }
  }
}

export function normalizeCode(code: string): string {
  return (code ?? '').replace(/\s+/g, '').toUpperCase();
}

function isWellFormed(code: string): boolean {
  return (
    code.length === LINK_CODE_LENGTH &&
    [...code].every((c) => LINK_CODE_ALPHABET.includes(c))
  );
}
