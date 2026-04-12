export class Auth0UserDto {
    auth0UserId: string;
    username: string;
    lastSyncedAt?: Date;
    agoraUserId?: number;
}