import { Injectable } from '@nestjs/common';
import { S3Service } from './s3.service';

@Injectable()
export class VideoService {
  constructor(private s3Service: S3Service) {}

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
}
