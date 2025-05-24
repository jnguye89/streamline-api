import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from './../../auth/public.decorator';
import { S3Service } from 'src/services/s3.service';

@Controller('video')
export class VideoController {
  constructor(private s3Service: S3Service) {}

  @Get()
  @Public()
  // async getAllVideos(@Req() req): Promise<string[] | undefined> {
  //   console.log(req.user);
  async getAllVideos(): Promise<string[] | undefined> {
    return await this.s3Service.getAllVideos();
  }

  @UseInterceptors(FileInterceptor('video'))
  @Post()
  async createVideo(@UploadedFile() video: Express.Multer.File) {
    if (!video) {
      throw new Error('No file provided.');
    }
    return await this.s3Service.uploadFile(video);
  }
}
