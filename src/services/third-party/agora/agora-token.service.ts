// src/calls/agora-token.service.ts
import { Injectable } from '@nestjs/common';
import { RtcTokenBuilder, RtcRole, RtmTokenBuilder, RtmRole } from 'agora-access-token';

@Injectable()
export class AgoraTokenService {
    private readonly appId = process.env.AGORA_APP_ID!;
    private readonly appCert = process.env.AGORA_APP_CERT!;
    private readonly defaultTtl = Number(process.env.AGORA_TOKEN_TTL_SECONDS ?? 3600);

    createTokens(uid: string, channel: string, ttlSeconds?: number) {
        const expire = Math.floor(Date.now() / 1000) + (ttlSeconds ?? this.defaultTtl);

        // Use string uid for RTM; RTC can take string uid with "buildTokenWithAccount"
        const rtcToken = RtcTokenBuilder.buildTokenWithAccount(
            this.appId,
            this.appCert,
            channel,
            uid,                 // keep the same id across RTM/RTC
            RtcRole.PUBLISHER,
            expire
        );

        const rtmToken = RtmTokenBuilder.buildToken(
            this.appId,
            this.appCert,
            uid,
            RtmRole.Rtm_User,
            expire
        );

        return { appId: this.appId, rtcToken, rtmToken, expireAt: expire };
    }
}
