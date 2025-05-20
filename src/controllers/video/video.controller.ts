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
  @UseInterceptors(FileInterceptor('video'))
  async createVideo(@UploadedFile() file: Express.Multer.File) {
    console.log("you're in the controller: createVideo");
    if (!file) {
      throw new Error('No file provided.');
    }
    return await this.videoService.uploadVideo(file);
  }
}
