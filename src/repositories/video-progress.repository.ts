import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { VideoProgress } from 'src/entity/video-progress.entity';

@Injectable()
export class VideoProgressRepository {
  constructor(
    @InjectRepository(VideoProgress)
    private readonly videoProgressRepo: Repository<VideoProgress>,
  ) { }

  async upsertProgress(
    userId: string,
    videoId: number,
    timestamp: number,
  ): Promise<VideoProgress> {
    const existing = await this.videoProgressRepo.findOne({
      where: { userId, videoId },
    });

    if (existing) {
      existing.timestamp = timestamp;
      return this.videoProgressRepo.save(existing);
    }

    const created = this.videoProgressRepo.create({ userId, videoId, timestamp });
    return this.videoProgressRepo.save(created);
  }

  async findByUserAndVideoIds(
    userId: string,
    videoIds: number[],
  ): Promise<VideoProgress[]> {
    if (videoIds.length === 0) {
      return [];
    }
    return this.videoProgressRepo.find({
      where: { userId, videoId: In(videoIds) },
    });
  }
}
