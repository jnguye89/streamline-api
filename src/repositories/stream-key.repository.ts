import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StreamKey } from 'src/entity/stream-key.entity';
import { StreamPlatform } from 'src/enums/stream-platform.enum';

@Injectable()
export class StreamKeyRepository {
  constructor(
    @InjectRepository(StreamKey)
    private readonly streamKeyRepo: Repository<StreamKey>,
  ) { }

  async upsert(
    userId: string,
    platform: StreamPlatform,
    streamKey: string,
    streamUrl?: string,
  ): Promise<StreamKey> {
    const values: Partial<StreamKey> = { userId, platform, streamKey };
    // Omit entirely rather than passing undefined, so saving a Twitch key
    // (no URL) can never null out a URL already saved under a different call.
    if (streamUrl !== undefined) {
      values.streamUrl = streamUrl;
    }

    await this.streamKeyRepo.upsert(values, ['userId', 'platform']);
    return await this.streamKeyRepo.findOneByOrFail({ userId, platform });
  }

  async findAllByUserId(userId: string): Promise<StreamKey[]> {
    return this.streamKeyRepo.find({ where: { userId } });
  }
}
