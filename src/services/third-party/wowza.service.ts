// src/streams/wowza.service.ts
import { Injectable, HttpException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CreateStreamDto } from 'src/dto/create-stream.dto';
import { PlaybackDto } from 'src/dto/playback.dto';
import jwt from 'jsonwebtoken';

@Injectable()
export class WowzaService {
  private readonly log = new Logger(WowzaService.name);

  constructor(
    private readonly http: HttpService,
    private readonly cfg: ConfigService,
  ) {}

  /** Generic signed GET/POST helpers */
  private async wGet<T>(path: string) {
    const res$ = this.http.get<T>(`${process.env.WOWZA_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${this.cfg.get('WOWZA_JWT')}` },
    });
    const data = (await firstValueFrom(res$)).data;
    console.log('response', data);
    return data;
  }

  private async wPost<T>(path: string, body: any) {
    const res$ = this.http.post<T>(
      `${this.cfg.get('WOWZA_API_BASE')}${path}`,
      body,
      { headers: { Authorization: `Bearer ${process.env.WOWZA_JWT}` } },
    );
    return (await firstValueFrom(res$)).data;
  }

  /** 1️⃣  Create a live stream object */
  async createLiveStream(dto: CreateStreamDto) {
    const body = {
      live_stream: {
        name: dto.name,
        broadcast_location: dto.broadcastLocation,
        encoder: dto.encoder,
        low_latency: !!dto.lowLatency,
        // the defaults (1280×720, pay_as_you_go, push) are fine  :contentReference[oaicite:1]{index=1}
      },
    };
    try {
      const { live_stream } = await this.wPost<any>('/live_streams', body);
      return live_stream;
    } catch (e) {
      this.log.error(e);
      throw new HttpException('Failed to create live stream', 500);
    }
  }

  async getStream(id: string): Promise<CreateStreamDto> {
    const { live_stream } = await this.wGet<any>(`/live_streams/${id}`);
    if (!live_stream) {
      throw new HttpException('Live stream not found', 404);
    }
    const token = jwt.sign(
      {
        iss: 'wowza', // issuer – arbitrary but consistent
        sub: 'publisher', // subject – role
        streamName: live_stream.source_connection_information.stream_name, // **must** match source_connection_information.stream_name
      },
      '643e34c112dab623c77eb2cfec1c83a5',
      { algorithm: 'HS256', expiresIn: '5m' }, // Wowza accepts ≤ 5-minute tokens
    );
    return {
      name: live_stream.name,
      broadcastLocation: live_stream.broadcast_location,
      encoder: live_stream.encoder,
      lowLatency: live_stream.low_latency,
      sdpUrl: live_stream.source_connection_information.sdp_url, // WebRTC Transport Service URL
      application: live_stream.source_connection_information.application_name, // e.g., live
      streamName: live_stream.source_connection_information.stream_name, // e.g., myStream
      token: token,
      //   rtmpUrl: live_stream.rtmp_url, // RTMP URL for publishing
    };
  }

  /** 2️⃣  Start or stop */
  async startStream(id: string) {
    await this.wPost(`/live_streams/${id}/start`, {});
  }
  async stopStream(id: string) {
    await this.wPost(`/live_streams/${id}/stop`, {});
  }

  /** 3️⃣  Return minimal playback descriptor for the UI */
  async getPlayback(id: string): Promise<PlaybackDto> {
    const { live_stream } = await this.wGet<any>(`/live_streams/${id}`);
    const direct = live_stream.direct_playback_urls; // WebRTC, RTMP, …
    return {
      streamId: id,
      hlsUrl: live_stream.hls_playback_url, // :contentReference[oaicite:2]{index=2}
      webrtcUrl: direct?.webrtc?.find((x: any) => x.name === 'source')?.url,
      rtmpUrl: direct?.rtmp?.find((x: any) => x.name === 'source')?.url,
    };
  }
}
