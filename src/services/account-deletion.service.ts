import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';

import { AgoraStream } from 'src/entity/agora-stream.entity';
import { Audio } from 'src/entity/audio.entity';
import { Multistream } from 'src/entity/multistream.entity';
import { Podcast } from 'src/entity/podcast.entity';
import { Report } from 'src/entity/report.entity';
import { Stream } from 'src/entity/stream.entity';
import { StreamKey } from 'src/entity/stream-key.entity';
import { Thread } from 'src/entity/thread.entity';
import { User } from 'src/entity/user.entity';
import { UserBlock } from 'src/entity/user-block.entity';
import { User_Integration } from 'src/entity/user-integration.entity';
import { Video } from 'src/entity/video.entity';
import { VideoLike } from 'src/entity/video-like.entity';
import { VideoProgress } from 'src/entity/video-progress.entity';
import { YoutubeChannel } from 'src/entity/youtube-channel.entity';
import { AgoraStreamRepository } from 'src/repositories/agora-stream.repository';
import { VideoFeedRepository } from 'src/repositories/video-feed.repository';
import { MultistreamService } from './multistream.service';
import { AgoraRecordingService } from './third-party/agora/agora-recording.service';
import { Auth0Service } from './third-party/auth0.service';
import { S3Service } from './third-party/s3.service';
import { YoutubeSyncSchedulerService } from './youtube-sync-scheduler.service';

/** What the database step removed that lives elsewhere and still needs cleaning up. */
type Removed = {
  s3Keys: string[];
  videoIds: number[];
  hadYoutubeChannels: boolean;
};

export const DELETED_USERNAME = 'Deleted user';

/**
 * Deletes a user's account, as App Store guideline 5.1.1(v) requires apps with sign-up to
 * offer. In order:
 *
 * 1. End any live stream, so nothing keeps broadcasting (or recording) as them.
 * 2. Delete their Auth0 account, so they can't sign in again. If this fails nothing else has
 *    changed, and they can simply try again.
 * 3. In one transaction, delete everything they own or did — videos (and others' likes and
 *    progress on them), likes, watch progress, audio, podcasts, threads, stream history,
 *    stream keys, restreams, integrations and YouTube channels — and anonymize their user row.
 *    The row stays because other people's chess games point at it.
 * 4. Remove their files from S3 and drop them from the feed, in the background.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);
  private readonly cloudRecordingEnabled =
    process.env.AGORA_CLOUD_RECORDING_ENABLED !== 'false';

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auth0Service: Auth0Service,
    private readonly s3Service: S3Service,
    private readonly agoraStreamRepository: AgoraStreamRepository,
    private readonly multistreamService: MultistreamService,
    private readonly agoraRecordingService: AgoraRecordingService,
    private readonly videoFeedRepository: VideoFeedRepository,
    private readonly youtubeSyncSchedulerService: YoutubeSyncSchedulerService,
  ) {}

  async deleteAccount(userId: string): Promise<void> {
    await this.endLiveStreams(userId);
    await this.auth0Service.deleteUser(userId);
    const removed = await this.dataSource.transaction((manager) =>
      this.deleteData(manager, userId),
    );
    void this.cleanUpElsewhere(userId, removed);
  }

  /**
   * Stops their broadcasts the way ending a stream normally does. Best effort: a stream that
   * can't be stopped cleanly still gets marked ended, and its heartbeat stops with the app.
   * Stopping a recording saves it as a video, which the database step then deletes.
   */
  private async endLiveStreams(userId: string): Promise<void> {
    const streams = await this.dataSource.getRepository(AgoraStream).find({
      where: { user: { auth0UserId: userId }, status: In(['created', 'live']) },
    });
    for (const stream of streams) {
      const wasLive = stream.status === 'live';
      stream.status = 'ended';
      await this.agoraStreamRepository.save(stream);
      await this.multistreamService.stopAll(stream.channelName);
      if (wasLive && this.cloudRecordingEnabled) {
        await this.agoraRecordingService
          .stopRecording(stream.channelName)
          .catch((e: unknown) =>
            this.logger.warn(
              `Couldn't stop recording ${stream.channelName}: ${this.message(e)}`,
            ),
          );
      }
    }
  }

  private async deleteData(
    manager: EntityManager,
    userId: string,
  ): Promise<Removed> {
    const s3Keys: string[] = [];
    const addKey = (pathOrUrl: string | null | undefined) => {
      const key = this.s3Service.keyFor(pathOrUrl);
      if (key) s3Keys.push(key);
    };

    // Their videos, including ones already soft-deleted, and everyone's engagement with them.
    const videos = await manager.find(Video, {
      where: { user: userId },
      withDeleted: true,
    });
    const videoIds = videos.map((v) => v.id);
    for (const video of videos) {
      addKey(video.videoPath);
      addKey(video.processedPath);
      addKey(video.thumbnailUrl);
    }
    if (videoIds.length) {
      await manager.delete(VideoLike, { videoId: In(videoIds) });
      await manager.delete(VideoProgress, { videoId: In(videoIds) });
      await manager.delete(Video, { id: In(videoIds) });
    }

    // Their activity on other people's videos. Like counts are left as they are.
    await manager.delete(VideoLike, { userId });
    await manager.delete(VideoProgress, { userId });

    const audio = await manager.find(Audio, { where: { user: userId } });
    audio.forEach((a) => addKey(a.audioPath));
    await manager.delete(Audio, { user: userId });

    await manager.delete(Podcast, { auth0UserId: userId });
    // Reports they filed go; reports about them stay, as the moderation record.
    await manager.delete(Report, { reporterId: userId });
    await manager.delete(UserBlock, { blockerId: userId });
    await manager.delete(UserBlock, { blockedId: userId });
    await manager.delete(Thread, { auth0UserId: userId });
    await manager.delete(Multistream, { userId });
    await manager.delete(StreamKey, { userId });
    await manager.delete(User_Integration, { user: userId });
    const youtubeChannels = await manager.delete(YoutubeChannel, { userId });
    // Both join to the user through a user_id column, which delete() can't filter by relation.
    for (const entity of [AgoraStream, Stream]) {
      await manager
        .createQueryBuilder()
        .delete()
        .from(entity)
        .where('user_id = :userId', { userId })
        .execute();
    }

    const user = await manager.findOne(User, {
      where: { auth0UserId: userId },
    });
    if (user) {
      addKey(user.picture);
      await manager.update(
        User,
        { auth0UserId: userId },
        { username: DELETED_USERNAME, picture: null, deletedAt: new Date() },
      );
    }

    return { s3Keys, videoIds, hadYoutubeChannels: !!youtubeChannels.affected };
  }

  /** Each step is independent; a failure is logged so the leftovers can be cleaned up by hand. */
  private async cleanUpElsewhere(
    userId: string,
    removed: Removed,
  ): Promise<void> {
    const steps: [string, () => Promise<unknown>][] = [
      ['delete S3 files', () => this.s3Service.deleteObjects(removed.s3Keys)],
      [
        'remove videos from the feed',
        () =>
          Promise.all(
            removed.videoIds.map((id) =>
              this.videoFeedRepository.removeVideo(id),
            ),
          ),
      ],
      ['forget feed state', () => this.videoFeedRepository.forgetUser(userId)],
    ];
    if (removed.hadYoutubeChannels) {
      steps.push([
        'refresh the YouTube cache',
        () => this.youtubeSyncSchedulerService.refreshCache(),
      ]);
    }
    for (const [what, step] of steps) {
      try {
        await step();
      } catch (e: unknown) {
        this.logger.error(
          `Account ${userId} deleted, but couldn't ${what}: ${this.message(e)}`,
        );
      }
    }
  }

  private message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
