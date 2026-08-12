import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { YoutubeVideoDto } from 'src/dto/youtube-video.dto';

const CACHE_KEY = 'youtube:videos:cache';

@Injectable()
export class YoutubeVideoCacheRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) { }

  async getCached(): Promise<YoutubeVideoDto[]> {
    const raw = await this.redis.get(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as YoutubeVideoDto[];
  }

  async setCached(videos: YoutubeVideoDto[], ttlSeconds: number): Promise<void> {
    await this.redis.set(CACHE_KEY, JSON.stringify(videos), 'EX', ttlSeconds);
  }
}
