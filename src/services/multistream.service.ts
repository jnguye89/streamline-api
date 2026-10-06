import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MultistreamStatusDto } from 'src/dto/multistream.dto';
import { Multistream } from 'src/entity/multistream.entity';
import { StreamKey } from 'src/entity/stream-key.entity';
import { StreamPlatform } from 'src/enums/stream-platform.enum';
import { MultistreamRepository } from 'src/repositories/multistream.repository';
import { StreamKeyRepository } from 'src/repositories/stream-key.repository';
import { AgoraMediaPushService } from './third-party/agora/agora-media-push.service';

const PLATFORM_LABELS: Record<StreamPlatform, string> = {
  [StreamPlatform.TWITCH]: 'Twitch',
  [StreamPlatform.KICK]: 'Kick',
  [StreamPlatform.RUMBLE]: 'Rumble',
};

/** Platforms a live stream can currently be restreamed to. */
const MULTISTREAM_PLATFORMS = new Set<StreamPlatform>([StreamPlatform.TWITCH]);

@Injectable()
export class MultistreamService {
  private readonly logger = new Logger(MultistreamService.name);
  private readonly twitchIngestUrl = (
    process.env.TWITCH_INGEST_URL || 'rtmp://live.twitch.tv/app'
  ).replace(/\/+$/, '');

  constructor(
    private multistreamRepository: MultistreamRepository,
    private streamKeyRepository: StreamKeyRepository,
    private mediaPush: AgoraMediaPushService,
  ) {}

  /**
   * Validates a client-supplied platform list. Call this before any side
   * effects so a bad request can't leave a half-started stream behind.
   */
  parsePlatforms(input: unknown): StreamPlatform[] {
    if (input === undefined || input === null) return [];
    if (!Array.isArray(input)) {
      throw new BadRequestException('multistream must be an array');
    }
    const platforms = new Set<StreamPlatform>();
    for (const value of input) {
      if (!MULTISTREAM_PLATFORMS.has(value as StreamPlatform)) {
        throw new BadRequestException(
          `Multistreaming is not supported for: ${String(value)}`,
        );
      }
      platforms.add(value as StreamPlatform);
    }
    return [...platforms];
  }

  /**
   * Starts pushing the channel to each platform using the user's saved
   * stream key. A failure on one platform is reported in the result rather
   * than thrown, so it never takes down the main stream.
   */
  async start(
    channelName: string,
    userId: string,
    hostUid: number,
    platforms: StreamPlatform[],
  ): Promise<MultistreamStatusDto[]> {
    // A previous go-live on this channel whose stop never reached Agora
    // would otherwise keep pushing alongside the new converter.
    await this.stopAll(channelName);
    if (platforms.length === 0) return [];

    let keys: StreamKey[];
    try {
      keys = await this.streamKeyRepository.findAllByUserId(userId);
    } catch (error: unknown) {
      this.logger.error(
        `Could not load stream keys for ${userId}: ${this.message(error)}`,
      );
      return platforms.map((platform) => ({
        platform,
        status: 'error',
        error: `Could not start streaming to ${PLATFORM_LABELS[platform]}`,
      }));
    }
    return Promise.all(
      platforms.map((platform) =>
        this.startOne(
          channelName,
          userId,
          hostUid,
          platform,
          keys.find((key) => key.platform === platform),
        ),
      ),
    );
  }

  /** Stops every restream of the channel. Never throws. */
  async stopAll(channelName: string): Promise<void> {
    let multistreams: Multistream[];
    try {
      multistreams =
        await this.multistreamRepository.findActiveByChannelName(channelName);
    } catch (error: unknown) {
      this.logger.error(
        `Could not load multistreams for ${channelName}: ${this.message(error)}`,
      );
      return;
    }

    await Promise.all(
      multistreams.map(async (multistream) => {
        try {
          if (multistream.converterId) {
            await this.mediaPush.deleteConverter(
              multistream.converterId,
              multistream.region,
            );
          }
          multistream.status = 'stopped';
          await this.multistreamRepository.save(multistream);
        } catch (error: unknown) {
          // Left active so the next stopAll() on this channel retries it;
          // Agora's idle timeout reaps the converter once the host leaves.
          this.logger.error(
            `Could not stop ${multistream.platform} multistream for ${channelName}: ${this.message(error)}`,
          );
        }
      }),
    );
  }

  private async startOne(
    channelName: string,
    userId: string,
    hostUid: number,
    platform: StreamPlatform,
    streamKey: StreamKey | undefined,
  ): Promise<MultistreamStatusDto> {
    const label = PLATFORM_LABELS[platform];
    const key = streamKey?.streamKey?.trim();
    if (!key) {
      return {
        platform,
        status: 'error',
        error: `No ${label} stream key is saved`,
      };
    }

    let multistream: Multistream | undefined;
    try {
      multistream = await this.multistreamRepository.create({
        channelName,
        userId,
        platform,
        region: this.mediaPush.region,
        status: 'starting',
        converterId: null,
        errorMessage: null,
      });
      const converter = await this.mediaPush.createConverter({
        name: this.converterName(channelName, platform),
        channelName,
        hostUid,
        rtmpUrl: this.rtmpUrl(platform, key),
        region: multistream.region,
      });
      multistream.converterId = converter.id;
      multistream.status = 'active';
      await this.multistreamRepository.save(multistream);
      return { platform, status: 'active' };
    } catch (error: unknown) {
      const message = this.message(error);
      this.logger.error(
        `Could not start ${label} multistream for ${channelName}: ${message}`,
      );
      if (multistream) await this.recordFailure(multistream, message);
      return {
        platform,
        status: 'error',
        error: `Could not start streaming to ${label}`,
      };
    }
  }

  private async recordFailure(
    multistream: Multistream,
    message: string,
  ): Promise<void> {
    try {
      // Agora accepted the converter but its id couldn't be saved: drop it
      // rather than leave a push running that stopAll() can't find.
      if (multistream.converterId) {
        await this.mediaPush.deleteConverter(
          multistream.converterId,
          multistream.region,
        );
      }
      multistream.status = 'error';
      multistream.errorMessage = message.slice(0, 500);
      await this.multistreamRepository.save(multistream);
    } catch (error: unknown) {
      this.logger.error(
        `Could not clean up failed ${multistream.platform} multistream: ${this.message(error)}`,
      );
    }
  }

  private rtmpUrl(platform: StreamPlatform, streamKey: string): string {
    switch (platform) {
      case StreamPlatform.TWITCH:
        return `${this.twitchIngestUrl}/${streamKey}`;
      default:
        throw new Error(`Multistreaming is not supported for ${platform}`);
    }
  }

  /**
   * Agora converter names must be unique per project and at most 64 chars
   * of [A-Za-z0-9_]. The timestamp keeps a retry from colliding with a
   * converter whose delete never went through.
   */
  private converterName(channelName: string, platform: StreamPlatform) {
    const suffix = `_${platform}_${Date.now().toString(36)}`;
    const channel = channelName
      .replace(/[^A-Za-z0-9_]/g, '_')
      .slice(0, 64 - suffix.length);
    return `${channel}${suffix}`;
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
