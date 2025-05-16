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

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async createVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('No file provided.');
    }
    return await this.videoService.uploadVideo(file);
  }
}
