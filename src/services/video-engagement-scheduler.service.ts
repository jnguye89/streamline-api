import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { VideoRepository } from 'src/repositories/video.repository';

const SIX_HOURS_MS = 1 * 60 * 60 * 1000;

@Injectable()
export class VideoEngagementSchedulerService {
  private readonly logger = new Logger(VideoEngagementSchedulerService.name);

  constructor(private videoRepository: VideoRepository) { }

  @Interval(SIX_HOURS_MS)
  async boostEngagement(): Promise<void> {
    this.logger.log('Boosting view/like counts for all videos');
    await this.videoRepository.boostAllEngagement();
  }
}
