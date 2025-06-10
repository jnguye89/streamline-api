import { Injectable } from '@nestjs/common';
import { S3Service } from './s3.service';
import { VideoRepository } from 'src/repositories/video.repository';
import { Video } from 'src/entity/video.entity';
import { VideoDto } from 'src/dto/video.dto';

@Injectable()
export class VideoService {
  constructor(
    private s3Service: S3Service,
    private videoRepository: VideoRepository,
  ) {}

  async getAllVideos(): Promise<string[]> {
    return this.s3Service.listFiles();
  }

  async uploadVideo(file: Express.Multer.File): Promise<string> {
    const blob = this.s3Service.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    return blob;
  }

  async getDbVideos(): Promise<VideoDto[]> {
    return this.videoRepository.findAll();
  }

  async getDbVideosByUserId(userId: string): Promise<Video[]> {
    const videos = await this.videoRepository.findAllByUserId(userId);

    return Promise.all(
      videos.map(async (video) => {
        const url = await this.s3Service.getSignedUrl(video.videoPath);
        return { ...video, videoPath: url } as Video;
      }),
    );
  }

  async uploadVideoToDb(video: VideoDto): Promise<Video> {
    return this.videoRepository.create(video);
  }
}
