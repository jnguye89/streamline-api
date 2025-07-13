import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from './../../auth/public.decorator';
import { VideoService } from 'src/services/video.service';
import { User } from 'src/auth/user.decorator';
import { VideoDto } from 'src/dto/video.dto';
import { UserDto } from 'src/dto/user.dto';
import { IvsService } from 'src/services/third-party/ivs.services';

@Controller('video')
export class VideoController {
  constructor(
    private videoService: VideoService,
    private ivsService: IvsService,
  ) {}

  @Get()
  @Public()
  async getAllVideos(): Promise<VideoDto[]> {
    return await this.videoService.getAllVideos();
  }

  @Get('user/:id')
  @Public()
  async getUserVideos(@Param('id') id: string): Promise<VideoDto[]> {
    return await this.videoService.getDbVideosByUserId(id);
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

  @Get('status')
  @Public()
  async checkLive() {
    const channelArn =
      'arn:aws:ivs:us-west-2:578074109079:channel/kqI34tnoji5s';
    const isLive = await this.ivsService.isStreamLive(channelArn);
    return { isLive };
  }
}
