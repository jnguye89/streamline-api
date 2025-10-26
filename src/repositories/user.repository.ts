import { Mapper } from "@automapper/core";
import { InjectMapper } from "@automapper/nestjs";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Auth0UserDto } from "src/dto/auth0-user.dto";
import { User } from "src/entity/user.entity";
import { Repository } from "typeorm";

@Injectable()
export class UserRepository {
    constructor(
        @InjectMapper() private readonly mapper: Mapper,
        @InjectRepository(User) private readonly userRepo: Repository<User>
    ) { }

    async getUser(auth0UserId: string): Promise<Auth0UserDto> {
        const result = await this.userRepo.findOne({
            where: { auth0UserId }
        });

        return this.mapper.map(result, User, Auth0UserDto);
    }

    async createUser(user: Auth0UserDto): Promise<Auth0UserDto> {
        const entity = this.mapper.map(user, Auth0UserDto, User);
        entity.lastSyncedAt = new Date;
        const newUser = this.userRepo.create(entity);
        return this.mapper.map(await this.userRepo.save(newUser), User, Auth0UserDto);
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

    async getUsers() {
        const users = await this.userRepo.find();
        return this.mapper.mapArray(users, User, Auth0UserDto)
    }

    async getAuth0User(auth0Id: string): Promise<Auth0UserDto> {
        const user = await this.userRepo.findOne({
            where: {
                auth0UserId: auth0Id
            }
        })

        return this.mapper.map(user, User, Auth0UserDto);
    }
}