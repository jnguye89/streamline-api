import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from './../../auth/public.decorator';
import { VideoService } from 'src/services/video.service';

@Controller('video')
export class VideoController {
  constructor(private videoService: VideoService) {}

  @Get()
  @Public()
  async getAllVideos(): Promise<string[]> {
    return await this.videoService.getAllVideos();
  }

  @UseInterceptors(FileInterceptor('video'))
  @Post()
  async createVideo(@UploadedFile() file: Express.Multer.File) {
    console.log("you're in the controller: createVideo");
    if (!file) {
      throw new Error('No file provided.');
    }
    return await this.videoService.uploadVideo(file);
  }
}
