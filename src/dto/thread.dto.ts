import { AutoMap } from "@automapper/classes";
import { Auth0UserDto } from "./auth0-user.dto";

export class ThreadDto {
    @AutoMap()
    id?: number;
    @AutoMap()
    threadText: string;
    @AutoMap()
    auth0UserId: string;
    @AutoMap()
    createdAt: Date;
    @AutoMap()
    updatedAt: Date;

    @AutoMap()
    user?: Auth0UserDto;
}