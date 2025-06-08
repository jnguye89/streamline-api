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
import { User } from 'src/auth/user.decorator';
import { VideoDto } from 'src/dto/video.dto';
import { UserDto } from 'src/dto/user.dto';

@Controller('video')
export class VideoController {
  constructor(private videoService: VideoService) {}

  @Get()
  @Public()
  async getAllVideos(): Promise<string[]> {
    return await this.videoService.getAllVideos();
  }

  @Get('db')
  @Public()
  async getDbVideos(): Promise<VideoDto[]> {
    return await this.videoService.getDbVideos();
  }

  @Get('user')
  async getUserVideos(@User() user: UserDto): Promise<VideoDto[]> {
    if (!user || !user.userId) {
      throw new Error('User not authenticated.');
    }
    return await this.videoService.getDbVideosByUserId(user.userId);
  }

  @UseInterceptors(FileInterceptor('file'))
  @Post()
  async createVideo(
    @UploadedFile() file: Express.Multer.File,
    @User() user: UserDto,
  ) {
    if (!file) {
      throw new Error('No file provided.');
    }
    const url = await this.videoService.uploadVideo(file);

    await this.videoService.uploadVideoToDb({
      videoPath: url,
      user: `${user.userId}`,
    });
    return;
  }
}
