import { Injectable, OnModuleInit } from '@nestjs/common';
import { S3Service } from './third-party/s3.service';
import { VideoRepository } from 'src/repositories/video.repository';
import { VideoProgressRepository } from 'src/repositories/video-progress.repository';
import { VideoFeedRepository } from 'src/repositories/video-feed.repository';
import { Video } from 'src/entity/video.entity';
import { VideoDto } from 'src/dto/video.dto';

const DEFAULT_FEED_LIMIT = 20;
const MAX_FEED_LIMIT = 100;

@Injectable()
export class VideoService implements OnModuleInit {
  constructor(
    private s3Service: S3Service,
    private videoRepository: VideoRepository,
    private videoProgressRepository: VideoProgressRepository,
    private videoFeedRepository: VideoFeedRepository,
  ) { }

  async onModuleInit(): Promise<void> {
    const ids = await this.videoRepository.findAllIds();
    await this.videoFeedRepository.seedMasterSet(ids);
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.s3Service.getSignedUrl(key);
  }

  async getAllVideos(userId?: string, limit: number = DEFAULT_FEED_LIMIT): Promise<VideoDto[]> {
    const cappedLimit = Math.min(Math.max(limit, 1), MAX_FEED_LIMIT);
    const ids = userId
      ? await this.videoFeedRepository.popRandomUnseen(userId, cappedLimit)
      : await this.videoFeedRepository.popRandom(cappedLimit);
    const videos = await this.videoRepository.findByIds(ids);

    const progressByVideoId = new Map<number, number>();
    if (userId) {
      const progress = await this.videoProgressRepository.findByUserAndVideoIds(
        userId,
        videos.map((video) => video.id as number),
      );
      progress.forEach((entry) => progressByVideoId.set(entry.videoId, entry.timestamp));
    }

    return Promise.all(
      videos.map(async (video) => {
        const resumeTimestamp = progressByVideoId.get(video.id as number) ?? 0;
        return { ...(await this.attachSignedUrls(video)), resumeTimestamp } as VideoDto;
      }),
    );
  }

  /** The video the user last recorded progress on, for cross-device resume. Null if they've never watched anything. */
  async getContinueWatching(userId: string): Promise<VideoDto | null> {
    const progress = await this.videoProgressRepository.findMostRecentByUser(userId);
    if (!progress) return null;

    const [video] = await this.videoRepository.findByIds([progress.videoId]);
    if (!video) return null;

    return { ...(await this.attachSignedUrls(video)), resumeTimestamp: progress.timestamp } as VideoDto;
  }

  async saveProgress(userId: string, videoId: number, timestamp: number): Promise<void> {
    await this.videoProgressRepository.upsertProgress(userId, videoId, timestamp);
  }

  async getVideoByPath(videoPath: string): Promise<VideoDto> {
    return await this.videoRepository.findByVideoPath(videoPath);
  }

  async getDbVideosByUserId(userId: string): Promise<VideoDto[]> {
    const videos = await this.videoRepository.findAllByUserId(userId);
    return Promise.all(videos.map((video) => this.attachSignedUrls(video)));
  }

  private async attachSignedUrls(video: VideoDto): Promise<VideoDto> {
    const videoPath = await this.s3Service.getSignedUrl(video.videoPath);
    if (!video.processedPath) {
      return { ...video, videoPath } as VideoDto;
    }
    const processedPath = await this.s3Service.getSignedUrl(video.processedPath);
    return { ...video, videoPath, processedPath } as VideoDto;
  }

  async deleteVideo(id: number): Promise<void> {
    console.log(id);
    await this.videoRepository.softDelete(id);
    await this.videoFeedRepository.removeVideo(id);
  }

  async uploadVideoToDb(video: VideoDto): Promise<VideoDto> {
    const saved = await this.videoRepository.create(video);
    if (saved.id !== undefined) {
      await this.videoFeedRepository.addVideo(saved.id);
    }
    return saved;
  }

  public async generateUploadUrl(
    fileName: string,
    mimeType: string,
    keyRoot: string
  ): Promise<{ uploadUrl: string; key: string }> {
    return await this.s3Service.generateUploadUrl(fileName, mimeType, keyRoot);
  }
}
