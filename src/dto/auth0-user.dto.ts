import { AutoMap } from "@automapper/classes";

export class Auth0UserDto {
    @AutoMap()
    auth0UserId: string;

    @AutoMap()
    username: string;

    @AutoMap()
    lastSyncedAt?: Date;
}