import { Injectable, OnModuleInit } from '@nestjs/common';
import { S3Service } from './third-party/s3.service';
import { VideoRepository } from 'src/repositories/video.repository';
import { VideoProgressRepository } from 'src/repositories/video-progress.repository';
import { VideoLikeRepository } from 'src/repositories/video-like.repository';
import { VideoFeedRepository } from 'src/repositories/video-feed.repository';
import { YoutubeVideoCacheRepository } from 'src/repositories/youtube-video-cache.repository';
import { Video } from 'src/entity/video.entity';
import { VideoDto } from 'src/dto/video.dto';
import { YoutubeVideoDto } from 'src/dto/youtube-video.dto';

const DEFAULT_FEED_LIMIT = 20;
const MAX_FEED_LIMIT = 100;
const YOUTUBE_SHARE_RATIO = 0.25;

function randomEngagementAmount(): number {
  return Math.floor(Math.random() * 100) + 1;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sampleWithoutReplacement<T>(items: T[], count: number): T[] {
  return shuffle(items).slice(0, count);
}

function toYoutubeVideoDto(video: YoutubeVideoDto): VideoDto {
  return {
    user: '',
    videoPath: video.embedUrl,
    watchUrl: video.watchUrl,
    source: 'YOUTUBE',
    externalId: video.externalId,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    viewCount: 0,
    likeCount: 0,
    resumeTimestamp: 0,
    liked: false,
  };
}

@Injectable()
export class VideoService implements OnModuleInit {
  constructor(
    private s3Service: S3Service,
    private videoRepository: VideoRepository,
    private videoProgressRepository: VideoProgressRepository,
    private videoLikeRepository: VideoLikeRepository,
    private videoFeedRepository: VideoFeedRepository,
    private youtubeVideoCacheRepository: YoutubeVideoCacheRepository,
  ) { }

  async onModuleInit(): Promise<void> {
    const ids = await this.videoRepository.findAllIds();
    await this.videoFeedRepository.seedMasterSet(ids);
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.s3Service.getSignedUrl(key);
  }

  async getAllVideos(
    userId?: string,
    limit: number = DEFAULT_FEED_LIMIT,
  ): Promise<VideoDto[]> {
    const cappedLimit = Math.min(Math.max(limit, 1), MAX_FEED_LIMIT);

    const cachedYoutubeVideos = await this.youtubeVideoCacheRepository.getCached();
    const youtubeSlots = Math.min(Math.round(cappedLimit * YOUTUBE_SHARE_RATIO), cachedYoutubeVideos.length);
    const s3Slots = cappedLimit - youtubeSlots;

    const ids = userId
      ? await this.videoFeedRepository.popRandomUnseen(userId, s3Slots)
      : await this.videoFeedRepository.popRandom(s3Slots);
    const videos = await this.videoRepository.findByIds(ids);

    const progressByVideoId = new Map<number, number>();
    let likedVideoIds = new Set<number>();
    if (userId) {
      const videoIds = videos.map((video) => video.id as number);
      const [progress, likedIds] = await Promise.all([
        this.videoProgressRepository.findByUserAndVideoIds(userId, videoIds),
        this.videoLikeRepository.findLikedVideoIds(userId, videoIds),
      ]);
      progress.forEach((entry) =>
        progressByVideoId.set(entry.videoId, entry.timestamp),
      );
      likedVideoIds = new Set(likedIds);
    }

    const s3Videos = await Promise.all(
      videos.map(async (video) => {
        const resumeTimestamp = progressByVideoId.get(video.id as number) ?? 0;
        const liked = likedVideoIds.has(video.id as number);
        return { ...(await this.attachSignedUrls(video)), source: 'S3', resumeTimestamp, liked } as VideoDto;
      }),
    );

    const youtubeVideos = sampleWithoutReplacement(cachedYoutubeVideos, youtubeSlots).map(toYoutubeVideoDto);

    return shuffle([...s3Videos, ...youtubeVideos]);
  }

  /**
   * Fetch a single video by its numeric id, regardless of whether it turns
   * up in the random feed getAllVideos() would otherwise serve. That feed
   * samples randomly per request (popRandomUnseen/popRandom), so there's no
   * guarantee any specific video appears in a given page or request - which
   * matters for a client-side deep link to one exact video (e.g. the
   * "back to the video I was watching" flow after visiting a profile page)
   * that can't just wait for it to randomly turn up. Null if the video
   * doesn't exist (deleted, or a bad id).
   */
  async getVideoById(id: number, userId?: string): Promise<VideoDto | null> {
    const [video] = await this.videoRepository.findByIds([id]);
    if (!video) return null;

    let resumeTimestamp = 0;
    let liked = false;
    if (userId) {
      const [progress, likedIds] = await Promise.all([
        this.videoProgressRepository.findByUserAndVideoIds(userId, [id]),
        this.videoLikeRepository.findLikedVideoIds(userId, [id]),
      ]);
      resumeTimestamp = progress.find((entry) => entry.videoId === id)?.timestamp ?? 0;
      liked = likedIds.includes(id);
    }

    return {
      ...(await this.attachSignedUrls(video)),
      source: 'S3',
      resumeTimestamp,
      liked,
    } as VideoDto;
  }

  /** The video the user last recorded progress on, for cross-device resume. Null if they've never watched anything. */
  async getContinueWatching(userId: string): Promise<VideoDto | null> {
    const progress =
      await this.videoProgressRepository.findMostRecentByUser(userId);
    if (!progress) return null;

    const [video] = await this.videoRepository.findByIds([progress.videoId]);
    if (!video) return null;

    const likedIds = await this.videoLikeRepository.findLikedVideoIds(userId, [
      progress.videoId,
    ]);
    return {
      ...(await this.attachSignedUrls(video)),
      resumeTimestamp: progress.timestamp,
      liked: likedIds.length > 0,
    } as VideoDto;
  }

  async saveProgress(
    userId: string,
    videoId: number,
    timestamp: number,
  ): Promise<void> {
    await this.videoProgressRepository.upsertProgress(
      userId,
      videoId,
      timestamp,
    );
  }

  // Not tied to real viewer/like counts yet - each call bumps the counter by
  // a random amount to seed apparent engagement until this is wired to
  // actual per-user views/likes.
  async recordView(id: number): Promise<void> {
    await this.videoRepository.incrementViewCount(id, randomEngagementAmount());
  }

  // The count always goes up regardless of login state; the per-user "liked"
  // record (used only to show the user they've liked it before) is only
  // saved when we have an identity to attach it to.
  async recordLike(id: number, userId?: string): Promise<void> {
    await this.videoRepository.incrementLikeCount(id, randomEngagementAmount());
    if (userId) {
      await this.videoLikeRepository.markLiked(userId, id);
    }
  }

  async getVideoByPath(videoPath: string): Promise<VideoDto> {
    return await this.videoRepository.findByVideoPath(videoPath);
  }

  async getDbVideosByUserId(userId: string): Promise<VideoDto[]> {
    const videos = await this.videoRepository.findAllByUserId(userId);
    return Promise.all(videos.map((video) => this.attachSignedUrls(video)));
  }

  private async attachSignedUrls(video: VideoDto): Promise<VideoDto> {
    const videoPath = await this.s3Service.getSignedUrl(video.videoPath);
    if (!video.processedPath) {
      return { ...video, videoPath } as VideoDto;
    }
    const processedPath = await this.s3Service.getSignedUrl(
      video.processedPath,
    );
    return { ...video, videoPath, processedPath } as VideoDto;
  }

  async deleteVideo(id: number): Promise<void> {
    console.log(id);
    await this.videoRepository.softDelete(id);
    await this.videoFeedRepository.removeVideo(id);
  }

  async uploadVideoToDb(video: VideoDto): Promise<VideoDto> {
    const saved = await this.videoRepository.create(video);
    if (saved.id !== undefined) {
      await this.videoFeedRepository.addVideo(saved.id);
    }
    return saved;
  }

  public async generateUploadUrl(
    fileName: string,
    mimeType: string,
    keyRoot: string,
  ): Promise<{ uploadUrl: string; key: string }> {
    return await this.s3Service.generateUploadUrl(fileName, mimeType, keyRoot);
  }
}
