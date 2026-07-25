import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Public } from './../../auth/public.decorator';
import { User } from './../../auth/user.decorator';
import { OptionalUser } from './../../auth/optional-user.decorator';
import { OptionalJwtAuthGuard } from './../../auth/optional-jwt-auth.guard';
import { UserModel } from 'src/models/user.model';
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
  @UseGuards(OptionalJwtAuthGuard)
  async getAllVideos(
    @OptionalUser() user: UserModel | null,
    @Query('limit') limit?: string,
  ): Promise<VideoDto[]> {
    return await this.videoService.getAllVideos(user?.userId, limit ? Number(limit) : undefined);
  }

  @Get('continue-watching')
  async getContinueWatching(@User() user: UserModel): Promise<VideoDto | null> {
    return await this.videoService.getContinueWatching(user.userId);
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

  @Post()
  async createVideo(
    @User() user: UserModel,
    @Body() body: { key: string },
  ): Promise<VideoDto> {
    return await this.videoService.uploadVideoToDb({
      user: user.userId,
      videoPath: body.key,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteVideo(@Param('id') id: string): Promise<void> {
    await this.videoService.deleteVideo(Number(id));
  }

  @Post(':id/progress')
  @HttpCode(204)
  async updateProgress(
    @User() user: UserModel,
    @Param('id') id: string,
    @Body() body: { timestamp: number },
  ): Promise<void> {
    await this.videoService.saveProgress(user.userId, Number(id), body.timestamp);
  }

  @Post('presign')
  async getUploadPresignedUrl(
    @Body() body: { fileName: string; mimeType: string },
  ) {
    const result = await this.videoService.generateUploadUrl(
      body.fileName,
      body.mimeType,
      'videos/original'
    );
    return result; // returns { uploadUrl, key }
  }
}
