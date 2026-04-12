import { Injectable } from '@nestjs/common';
import { S3Service } from './third-party/s3.service';
import { VideoRepository } from 'src/repositories/video.repository';
import { Video } from 'src/entity/video.entity';
import { VideoDto } from 'src/dto/video.dto';

@Injectable()
export class VideoService {
  constructor(
    private s3Service: S3Service,
    private videoRepository: VideoRepository,
  ) { }

  async getSignedUrl(key: string): Promise<string> {
    return this.s3Service.getSignedUrl(key);
  }

  async getAllVideos(): Promise<VideoDto[]> {
    const videos = await this.videoRepository.findAll();
    return Promise.all(
      videos.map(async (video) => {
        const url = await this.s3Service.getSignedUrl(video.videoPath);
        return { ...video, videoPath: url } as VideoDto;
      }),
    );
  }

  async getVideoByPath(videoPath: string): Promise<VideoDto> {
    return await this.videoRepository.findByVideoPath(videoPath);
  }

  async getDbVideosByUserId(userId: string): Promise<VideoDto[]> {
    const videos = await this.videoRepository.findAllByUserId(userId);

    return Promise.all(
      videos.map(async (video) => {
        const url = await this.s3Service.getSignedUrl(video.videoPath);
        return { ...video, videoPath: url } as VideoDto;
      }),
    );
  }

  async uploadVideoToDb(video: VideoDto): Promise<VideoDto> {
    return this.videoRepository.create(video);
  }

  public async generateUploadUrl(
    fileName: string,
    mimeType: string,
  ): Promise<{ uploadUrl: string; key: string }> {
    return await this.s3Service.generateUploadUrl(fileName, mimeType);
  }
}
