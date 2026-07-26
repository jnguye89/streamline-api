import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { VideoLike } from 'src/entity/video-like.entity';

@Injectable()
export class VideoLikeRepository {
  constructor(
    @InjectRepository(VideoLike)
    private readonly videoLikeRepo: Repository<VideoLike>,
  ) { }

  /** Idempotent - re-liking an already-liked video is a no-op. */
  async markLiked(userId: string, videoId: number): Promise<void> {
    await this.videoLikeRepo
      .createQueryBuilder()
      .insert()
      .into(VideoLike)
      .values({ userId, videoId })
      .orIgnore()
      .updateEntity(false)
      .execute();
  }

  async findLikedVideoIds(userId: string, videoIds: number[]): Promise<number[]> {
    if (videoIds.length === 0) return [];
    const rows = await this.videoLikeRepo.find({
      where: { userId, videoId: In(videoIds) },
    });
    return rows.map((row) => row.videoId);
  }
}
