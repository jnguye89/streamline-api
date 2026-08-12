// src/calls/agora-token.service.ts
import { Injectable } from '@nestjs/common';
import { RtcRole, RtcTokenBuilder, RtmTokenBuilder } from 'agora-token';

import { UserService } from 'src/services/user.service';

@Injectable()
export class AgoraTokenService {
  private readonly appId = process.env.AGORA_APP_ID!;
  private readonly appCert = process.env.AGORA_APP_CERT!;
  private readonly defaultTtl = Number(
    process.env.AGORA_TOKEN_TTL_SECONDS ?? 3600,
  );

  constructor(private userService: UserService) {}

  async createTokens(agoraUid: number, channel: string, ttlSeconds?: number) {
    // await this.userService.getAgoraUser(agoraUid);

    const ttl = ttlSeconds ?? this.defaultTtl;
    const expire = Math.floor(Date.now() / 1000) + ttl;
    const rtcToken = RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCert,
      channel,
      agoraUid,
      RtcRole.PUBLISHER,
      ttl,
      ttl,
    );

    const rtmToken = RtmTokenBuilder.buildToken(
      this.appId,
      this.appCert,
      String(agoraUid), // RTM uses string
      ttl,
    );

    return {
      appId: this.appId,
      rtcToken,
      rtmToken,
      expireAt: expire,
      agoraUid,
    };
  }

  createViewerTokens(channel: string, ttlSeconds?: number) {
    const ttl = ttlSeconds ?? this.defaultTtl;
    const expire = Math.floor(Date.now() / 1000) + ttl;

    // uid=0 tells Agora to auto-assign a unique UID per session, so concurrent
    // anonymous viewers on the same channel never collide with each other.
    const rtcToken = RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCert,
      channel,
      0,
      RtcRole.SUBSCRIBER,
      ttl,
      ttl,
    );

    return { appId: this.appId, rtcToken, expireAt: expire };
  }

  createBasicAuthToken(): string {
    const username = process.env.AGORA_CUSTOMER_ID;
    const password = process.env.AGORA_SECRET;
    return Buffer.from(`${username}:${password}`).toString('base64');
  }
}
