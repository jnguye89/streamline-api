import { Auth0UserDto } from "./auth0-user.dto";

export class ThreadDto {
    id?: number;
    threadText: string;
    auth0UserId: string;
    createdAt: Date;
    updatedAt: Date;
    user?: Auth0UserDto;
}