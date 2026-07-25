import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

const MASTER_SET_KEY = 'videos:all';
const unseenKey = (userId: string) => `videos:unseen:${userId}`;

@Injectable()
export class VideoFeedRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) { }

  async seedMasterSet(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.redis.sadd(MASTER_SET_KEY, ...ids.map(String));
  }

  async addVideo(id: number): Promise<void> {
    await this.redis.sadd(MASTER_SET_KEY, String(id));
  }

  async removeVideo(id: number): Promise<void> {
    await this.redis.srem(MASTER_SET_KEY, String(id));
  }

  /** Random, non-repeating (until exhausted) sample for a known user. */
  async popRandomUnseen(userId: string, limit: number): Promise<number[]> {
    const key = unseenKey(userId);

    if (!(await this.redis.exists(key))) {
      await this.repopulate(key);
    }

    let ids = await this.redis.spop(key, limit);

    if (ids.length < limit) {
      await this.repopulate(key);
      const remaining = limit - ids.length;
      if (remaining > 0) {
        const more = await this.redis.spop(key, remaining);
        ids = ids.concat(more);
      }
    }

    return Array.from(new Set(ids.map(Number)));
  }

  /** No stable identity to dedupe against, so just sample the master set. */
  async popRandom(limit: number): Promise<number[]> {
    const ids = await this.redis.srandmember(MASTER_SET_KEY, limit);
    return ids.map(Number);
  }

  private async repopulate(key: string): Promise<void> {
    await this.redis.sunionstore(key, MASTER_SET_KEY);
  }
}
