import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { User } from 'src/auth/user.decorator';
import { UserModel } from 'src/models/user.model';
import { YoutubeChannelDto } from 'src/dto/youtube-channel.dto';
import { YoutubeChannelRepository } from 'src/repositories/youtube-channel.repository';
import { YoutubeSyncSchedulerService } from 'src/services/youtube-sync-scheduler.service';
import { YoutubeService } from 'src/services/third-party/youtube.service';

@Controller('youtube-channels')
export class YoutubeChannelController {
  constructor(
    private youtubeChannelRepository: YoutubeChannelRepository,
    private youtubeSyncSchedulerService: YoutubeSyncSchedulerService,
    private youtubeService: YoutubeService,
  ) { }

  @Get()
  async getChannels(@User() user: UserModel): Promise<YoutubeChannelDto[]> {
    return await this.youtubeChannelRepository.findAllByUserId(user.userId);
  }

  @Get(':id')
  async getChannel(@User() user: UserModel, @Param('id') id: string): Promise<YoutubeChannelDto> {
    const channel = await this.youtubeChannelRepository.findOneByIdAndUserId(Number(id), user.userId);
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  @Post()
  async createChannel(
    @User() user: UserModel,
    @Body() body: { channelId: string; name?: string },
  ): Promise<YoutubeChannelDto> {
    const resolvedChannelId = await this.youtubeService.resolveChannelId(body.channelId);
    if (!resolvedChannelId) {
      throw new BadRequestException('Could not find a YouTube channel for that input');
    }
    const snippet = await this.youtubeService.getChannelSnippet(resolvedChannelId);
    return await this.youtubeChannelRepository.create({
      userId: user.userId,
      channelId: resolvedChannelId,
      name: body.name ?? snippet.title,
      handle: snippet.handle,
    });
  }

  @Patch(':id')
  async updateChannel(
    @User() user: UserModel,
    @Param('id') id: string,
    @Body() body: { name?: string; enabled?: boolean },
  ): Promise<YoutubeChannelDto> {
    const updated = await this.youtubeChannelRepository.update(Number(id), user.userId, body);
    if (!updated) throw new NotFoundException('Channel not found');
    return (await this.youtubeChannelRepository.findOneByIdAndUserId(Number(id), user.userId))!;
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteChannel(@User() user: UserModel, @Param('id') id: string): Promise<void> {
    const deleted = await this.youtubeChannelRepository.delete(Number(id), user.userId);
    if (!deleted) throw new NotFoundException('Channel not found');
  }

  @Post('sync')
  @HttpCode(204)
  async sync(): Promise<void> {
    await this.youtubeSyncSchedulerService.refreshCache();
  }
}
