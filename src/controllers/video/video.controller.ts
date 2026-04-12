import {
  Controller,
  Get,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { Public } from './../../auth/public.decorator';
import { VideoService } from 'src/services/video.service';
import { VideoDto } from 'src/dto/video.dto';
import { IvsService } from 'src/services/third-party/ivs.services';

@Controller('video')
export class VideoController {
  constructor(
    private videoService: VideoService,
    private ivsService: IvsService
  ) { }

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
