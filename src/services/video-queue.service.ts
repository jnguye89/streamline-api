import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class VideoQueueService {
  constructor(
    @InjectQueue('video-processing')
    private readonly videoQueue: Queue,
  ) {}

  async enqueueVideoProcessing(videoId: string) {
    await this.videoQueue.add(
      'process-video',
      { videoId, configs: { elevenLabs: true } },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}