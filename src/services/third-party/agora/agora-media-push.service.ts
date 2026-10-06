import { randomUUID } from 'crypto';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AgoraTokenService } from './agora-token.service';

const MEDIA_PUSH_REGIONS = ['na', 'eu', 'ap', 'cn'];

export interface CreateConverterOptions {
  /** Converter name: up to 64 chars, unique per Agora project. */
  name: string;
  channelName: string;
  /** Agora UID of the host whose audio/video is pushed. */
  hostUid: number;
  /** Full RTMP destination, including the stream key. */
  rtmpUrl: string;
  region: string;
}

export interface MediaPushConverter {
  id: string;
  state?: string;
  createTs?: number;
  updateTs?: number;
}

interface AgoraErrorResponse {
  message?: string;
  reason?: string;
  error?: string;
}

/**
 * Thin client for Agora's Media Push RESTful API ("rtmp-converters"),
 * which pulls an RTC channel server-side, transcodes it to H.264/AAC and
 * pushes it to an RTMP ingest such as Twitch. Media Push must be enabled
 * for the project in the Agora Console.
 */
@Injectable()
export class AgoraMediaPushService {
  private readonly baseUrl = 'https://api.agora.io';
  private readonly appId = process.env.AGORA_APP_ID!;
  readonly region = MEDIA_PUSH_REGIONS.includes(
    process.env.AGORA_MEDIA_PUSH_REGION?.toLowerCase() ?? '',
  )
    ? process.env.AGORA_MEDIA_PUSH_REGION!.toLowerCase()
    : 'na';

  // Defaults follow Twitch's ingest guidance for 720p30: H.264 high profile,
  // ~3 Mbps CBR video, 2s keyframe interval, 48kHz stereo AAC-LC audio.
  private readonly width = this.intEnv('AGORA_MEDIA_PUSH_WIDTH', 1280);
  private readonly height = this.intEnv('AGORA_MEDIA_PUSH_HEIGHT', 720);
  private readonly frameRate = this.intEnv('AGORA_MEDIA_PUSH_FPS', 30);
  private readonly videoBitrate = this.intEnv(
    'AGORA_MEDIA_PUSH_VIDEO_KBPS',
    3000,
  );
  private readonly audioBitrate = this.intEnv(
    'AGORA_MEDIA_PUSH_AUDIO_KBPS',
    128,
  );
  // Agora tears the converter down on its own once the channel has had no
  // stream to push for this long, so a host whose tab dies without calling
  // unpublish doesn't leave a converter running.
  private readonly idleTimeout = this.intEnv(
    'AGORA_MEDIA_PUSH_IDLE_TIMEOUT_SECONDS',
    60,
  );

  constructor(
    private agoraTokenService: AgoraTokenService,
    private http: HttpService,
  ) {}

  async createConverter(
    options: CreateConverterOptions,
  ): Promise<MediaPushConverter> {
    const { width, height, frameRate } = this;
    const payload = {
      converter: {
        name: options.name,
        transcodeOptions: {
          rtcChannel: options.channelName,
          audioOptions: {
            codecProfile: 'LC-AAC',
            sampleRate: 48000,
            bitrate: this.audioBitrate,
            audioChannels: 2,
            rtcStreamUids: [options.hostUid],
          },
          videoOptions: {
            canvas: { width, height },
            layout: [
              {
                rtcStreamUid: options.hostUid,
                region: { xPos: 0, yPos: 0, zIndex: 1, width, height },
                // Letterbox rather than crop: screen/console captures aren't
                // always 16:9 and cropping would cut off game HUDs.
                fillMode: 'fit',
              },
            ],
            codec: 'H.264',
            codecProfile: 'high',
            frameRate,
            gop: frameRate * 2,
            bitrate: this.videoBitrate,
          },
        },
        rtmpUrl: options.rtmpUrl,
        idleTimeout: this.idleTimeout,
      },
    };

    try {
      const { data } = await firstValueFrom(
        this.http.post<{ converter: MediaPushConverter }>(
          this.convertersUrl(options.region),
          payload,
          { headers: this.headers() },
        ),
      );
      if (!data?.converter?.id) {
        throw new Error('Agora Media Push did not return a converter id');
      }
      return data.converter;
    } catch (error: unknown) {
      throw new Error(
        `Agora Media Push create failed: ${this.describeError(error)}`,
      );
    }
  }

  /** Deletes a converter; one Agora no longer knows about counts as deleted. */
  async deleteConverter(converterId: string, region: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(
          `${this.convertersUrl(region)}/${encodeURIComponent(converterId)}`,
          { headers: this.headers() },
        ),
      );
    } catch (error: unknown) {
      if ((error as AxiosError).response?.status === 404) return;
      throw new Error(
        `Agora Media Push delete failed: ${this.describeError(error)}`,
      );
    }
  }

  private convertersUrl(region: string): string {
    return `${this.baseUrl}/${region}/v1/projects/${this.appId}/rtmp-converters`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Basic ${this.agoraTokenService.createBasicAuthToken()}`,
      'Content-Type': 'application/json',
      'X-Request-ID': randomUUID(),
    };
  }

  /**
   * Builds an error message from Agora's response only - never from the
   * request, whose body carries the stream key inside rtmpUrl.
   */
  private describeError(error: unknown): string {
    const axiosError = error as AxiosError<AgoraErrorResponse>;
    const status = axiosError.response?.status;
    if (status) {
      const body = axiosError.response?.data;
      const detail = body?.message ?? body?.reason ?? body?.error;
      return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  private intEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
