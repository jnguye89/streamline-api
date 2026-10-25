export class Auth0UserDto {
    auth0UserId: string;
    username: string;
    picture?: string | null;
    lastSyncedAt?: Date;
    agoraUserId?: number;
}