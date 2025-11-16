// src/calls/agora-token.service.ts
import { Injectable } from '@nestjs/common';
import { RtcTokenBuilder, RtcRole, RtmTokenBuilder, RtmRole } from 'agora-access-token';
import { UserService } from 'src/services/user.service';

@Injectable()
export class AgoraTokenService {
    private readonly appId = process.env.AGORA_APP_ID!;
    private readonly appCert = process.env.AGORA_APP_CERT!;
    private readonly defaultTtl = Number(process.env.AGORA_TOKEN_TTL_SECONDS ?? 3600);

    constructor(private userService: UserService) { }

    async createTokens(uid: string, channel: string, ttlSeconds?: number) {
        const user = await this.userService.getAuth0User(uid);
        const expire = Math.floor(Date.now() / 1000) + (ttlSeconds ?? this.defaultTtl);
        // uid = uid.replace(/\D/g, '')
        // Use string uid for RTM; RTC can take string uid with "buildTokenWithAccount"
        const rtcToken = RtcTokenBuilder.buildTokenWithAccount(
            this.appId,
            this.appCert,
            channel,
            !!user.agoraUserId ? `${user.agoraUserId}` : uid,                 // keep the same id across RTM/RTC
            RtcRole.PUBLISHER,
            expire
        );

        const rtmToken = RtmTokenBuilder.buildToken(
            this.appId,
            this.appCert,
            !!user ? `${user.agoraUserId}` : uid,
            RtmRole.Rtm_User,
            expire
        );

        return { appId: this.appId, rtcToken, rtmToken, expireAt: expire };
    }

    createBasicAuthToken(): string {
        const username = process.env.AGORA_CUSTOMER_ID;
        const password = process.env.AGORA_SECRET;
        return Buffer.from(`${username}:${password}`).toString('base64');
    }
}
