import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VideoService } from 'src/services/video.service';

@Controller('video')
export class VideoController {
  constructor(private videoService: VideoService) {}

  @Get()
  async getAllVideos(): Promise<string[]> {
    return await this.videoService.getAllVideos();
  }

  @UseInterceptors(
    FileInterceptor('video', {
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
      },
    }),
  )
  @Post()
  async createVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('No file provided.');
    }
    return await this.videoService.uploadVideo(file);
  }
}
