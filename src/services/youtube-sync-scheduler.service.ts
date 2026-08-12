import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { YoutubeChannelRepository } from 'src/repositories/youtube-channel.repository';
import { YoutubeVideoCacheRepository } from 'src/repositories/youtube-video-cache.repository';
import { YoutubeService } from './third-party/youtube.service';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CACHE_TTL_SECONDS = 5 * 60;

@Injectable()
export class YoutubeSyncSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(YoutubeSyncSchedulerService.name);

  constructor(
    private youtubeChannelRepository: YoutubeChannelRepository,
    private youtubeService: YoutubeService,
    private youtubeVideoCacheRepository: YoutubeVideoCacheRepository,
  ) { }

  async onModuleInit(): Promise<void> {
    await this.refreshCache();
  }

  @Interval(REFRESH_INTERVAL_MS)
  async refreshCache(): Promise<void> {
    this.logger.log('Refreshing YouTube video cache');
    const channels = await this.youtubeChannelRepository.findAllEnabled();

    const videosPerChannel = await Promise.all(
      channels.map((channel) => this.youtubeService.listChannelVideos(channel.channelId)),
    );

    const videos = videosPerChannel.flat();
    await this.youtubeVideoCacheRepository.setCached(videos, CACHE_TTL_SECONDS);
  }
}
