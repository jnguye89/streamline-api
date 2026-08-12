import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisClientService extends Redis implements OnApplicationShutdown {
  constructor() {
    super({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
    });
  }

  onApplicationShutdown(): void {
    this.disconnect();
  }
}
