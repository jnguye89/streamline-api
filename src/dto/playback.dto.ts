// src/wowza/dto/playback.dto.ts
export interface PlaybackDto {
  streamId: string;
  hlsUrl?: string; // scalable, ~8-10 s latency
  webrtcUrl?: string; // sub-second, ≤300 viewers
  rtmpUrl?: string; // optional
  expiresAt?: string; // if you later append signed tokens
  token?: string;
}
