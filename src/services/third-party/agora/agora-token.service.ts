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

    async createTokens(agoraUid: number, channel: string, ttlSeconds?: number) {
        const user = await this.userService.getAgoraUser(agoraUid);

        // Make sure this is a NUMBER. If you don’t have one, create/store one.
        // let agoraUidNumber = Number(user.agoraUserId);
        // if (!Number.isFinite(agoraUidNumber)) agoraUidNumber = +agoraUid;

        const expire = Math.floor(Date.now() / 1000) + (ttlSeconds ?? this.defaultTtl);
        // console.log(agoraUidNumber);

        const rtcToken = RtcTokenBuilder.buildTokenWithUid(
            this.appId,
            this.appCert,
            channel,
            agoraUid,
            RtcRole.PUBLISHER,
            expire
        );

        const rtmToken = RtmTokenBuilder.buildToken(
            this.appId,
            this.appCert,
            String(agoraUid), // RTM uses string
            RtmRole.Rtm_User,
            expire
        );

        return { appId: this.appId, rtcToken, rtmToken, expireAt: expire, agoraUid: agoraUid };
    }


    createBasicAuthToken(): string {
        const username = process.env.AGORA_CUSTOMER_ID;
        const password = process.env.AGORA_SECRET;
        return Buffer.from(`${username}:${password}`).toString('base64');
    }
}
