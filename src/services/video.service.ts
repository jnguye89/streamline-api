import { Injectable } from '@nestjs/common';
import { S3Service } from './third-party/s3.service';
import { VideoRepository } from 'src/repositories/video.repository';
import { VideoProgressRepository } from 'src/repositories/video-progress.repository';
import { Video } from 'src/entity/video.entity';
import { VideoDto } from 'src/dto/video.dto';

@Injectable()
export class VideoService {
  constructor(
    private s3Service: S3Service,
    private videoRepository: VideoRepository,
    private videoProgressRepository: VideoProgressRepository,
  ) { }

  async getSignedUrl(key: string): Promise<string> {
    return this.s3Service.getSignedUrl(key);
  }

  async getAllVideos(userId?: string): Promise<VideoDto[]> {
    const videos = await this.videoRepository.findAll();

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
        const url = await this.s3Service.getSignedUrl(video.videoPath);
        if (!!video.processedPath) {
          const processedUrl = await this.s3Service.getSignedUrl(video.processedPath);
          return { ...video, videoPath: url, processedPath: processedUrl, resumeTimestamp } as VideoDto;
        }
        return { ...video, videoPath: url, resumeTimestamp } as VideoDto;
      }),
    );
  }

  async saveProgress(userId: string, videoId: number, timestamp: number): Promise<void> {
    await this.videoProgressRepository.upsertProgress(userId, videoId, timestamp);
  }

  async getVideoByPath(videoPath: string): Promise<VideoDto> {
    return await this.videoRepository.findByVideoPath(videoPath);
  }

  async getDbVideosByUserId(userId: string): Promise<VideoDto[]> {
    const videos = await this.videoRepository.findAllByUserId(userId);

    return Promise.all(
      videos.map(async (video) => {
        const url = await this.s3Service.getSignedUrl(video.videoPath);
        if (!!video.processedPath) {
          const processedUrl = await this.s3Service.getSignedUrl(video.processedPath);
          return { ...video, videoPath: url, processedPath: processedUrl } as VideoDto;
        }
        return { ...video, videoPath: url } as VideoDto;
      }),
    );
  }

  async deleteVideo(id: number): Promise<void> {
    console.log(id);
    await this.videoRepository.softDelete(id);
  }

  async uploadVideoToDb(video: VideoDto): Promise<VideoDto> {
    return this.videoRepository.create(video);
  }

  public async generateUploadUrl(
    fileName: string,
    mimeType: string,
    keyRoot: string
  ): Promise<{ uploadUrl: string; key: string }> {
    return await this.s3Service.generateUploadUrl(fileName, mimeType, keyRoot);
  }
}
