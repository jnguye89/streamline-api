import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Auth0UserDto } from "src/dto/auth0-user.dto";
import { User } from "src/entity/user.entity";
import { Repository } from "typeorm";

@Injectable()
export class UserRepository {
    constructor(
        @InjectRepository(User) private readonly userRepo: Repository<User>
    ) { }

    async getUser(auth0UserId: string): Promise<Auth0UserDto> {
        const result = await this.userRepo.findOne({
            where: { auth0UserId }
        });

        return { ...result } as Auth0UserDto;
    }

    async getAgoraUser(augoraId: number): Promise<Auth0UserDto> {
        const result = await this.userRepo.findOne({
            where: { agoraUserId: augoraId }
        })

        return { ...result } as Auth0UserDto;
    }

    async createUser(user: Auth0UserDto): Promise<Auth0UserDto> {
        const existingUser = this.getUser(user.auth0UserId);
        if (!!existingUser) return existingUser;
        const entity = { ...user };
        entity.lastSyncedAt = new Date;
        const newUser = this.userRepo.create(entity);
        const savedUser = await this.userRepo.save(newUser)
        return { ...savedUser };
    }

    async updateUser(user: Auth0UserDto): Promise<Auth0UserDto> {
        const patch: Partial<User> = {
            username: user.username,
            lastSyncedAt: new Date
        };
        const entity = await this.userRepo.preload({ auth0UserId: user.auth0UserId, ...patch });
        if (!entity) throw new NotFoundException(`Thread ${user.auth0UserId} not found`);

        return this.userRepo.save(entity);
    }

    async getUsers(): Promise<Auth0UserDto[]> {
        const users = await this.userRepo.find();
        return [...users.map(e => { return { ...e } })];
    }

    async getAuth0User(auth0Id: string): Promise<Auth0UserDto> {
        const user = await this.userRepo.findOne({
            where: {
                auth0UserId: auth0Id
            }
        })

        return { ...user } as Auth0UserDto;
    }
}