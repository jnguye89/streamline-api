import { Injectable } from "@nestjs/common";
import { Auth0UserDto } from "src/dto/auth0-user.dto";
import { UserRepository } from "src/repositories/user.repository";
import { Auth0Service } from "./third-party/auth0.service";

@Injectable()
export class UserService {
    constructor(private readonly userRepo: UserRepository, private readonly auth0Service: Auth0Service) { }

    async getUser(auth0UserId: string): Promise<Auth0UserDto> {
        let user = await this.userRepo.getUser(auth0UserId);
        if (!user) {
            user = await this.createUser(auth0UserId);
        }
        else if (!user.lastSyncedAt || user.lastSyncedAt < new Date((new Date).getTime() - 24 * 60 * 60 * 1000)) {
            const auth0User = await this.auth0Service.getUser(auth0UserId);
            user = await this.userRepo.updateUser(auth0User);
        }
        return user;
    }

    async createUser(auth0UserId: string): Promise<Auth0UserDto> {
        const username = (await this.auth0Service.getUser(auth0UserId)).username;
        const user: Auth0UserDto = {
            username,
            auth0UserId
        };
        return await this.userRepo.createUser(user);
    }

    async getUsers(): Promise<Auth0UserDto[]> {
        return await this.userRepo.getUsers();
    }
}