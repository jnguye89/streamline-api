import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
  Param,
  Body,
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

  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
    }),
  )
  @Post()
async createVideo(@Body() body: { key: string }, @User() user: UserDto) {
    // if (!file) {
    //   throw new Error('No file provided.');
    // }
    // const url = await this.videoService.uploadVideo(file);

    const video = await this.videoService.uploadVideoToDb({
      videoPath: body.key,
      user: `${user.userId}`,
    });

    return {
      ...video,
      videoPath: await this.videoService.getSignedUrl(video.videoPath),
    };
  }
  // @Post()
  // async createVideo()

  @Get('status')
  @Public()
  async checkLive() {
    const channelArn =
      'arn:aws:ivs:us-west-2:578074109079:channel/kqI34tnoji5s';
    const isLive = await this.ivsService.isStreamLive(channelArn);
    return { isLive };
  }

  @Post('presign')
  async getUploadPresignedUrl(
    @Body() body: { fileName: string; mimeType: string },
  ) {
    const result = await this.videoService.generateUploadUrl(
      body.fileName,
      body.mimeType,
    );
    return result; // returns { uploadUrl, key }
  }
}
