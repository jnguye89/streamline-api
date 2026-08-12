import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { Auth0UserDto } from 'src/dto/auth0-user.dto';
import { User } from 'src/entity/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async getUser(auth0UserId: string): Promise<Auth0UserDto | null> {
    const result = await this.userRepo.findOne({
      where: { auth0UserId },
    });

    return result ? ({ ...result } as Auth0UserDto) : null;
  }

  async getAgoraUser(agoraId: number): Promise<Auth0UserDto | null> {
    const result = await this.userRepo.findOne({
      where: { agoraUserId: agoraId },
    });

    return result ? ({ ...result } as Auth0UserDto) : null;
  }

  async createUser(user: Auth0UserDto): Promise<Auth0UserDto> {
    const existingUser = await this.getUser(user.auth0UserId);
    if (existingUser) return existingUser;
    const entity = { ...user };
    entity.lastSyncedAt = new Date();
    const newUser = this.userRepo.create(entity);
    const savedUser = await this.userRepo.save(newUser);
    return { ...savedUser };
  }

  async updateUser(user: Auth0UserDto): Promise<Auth0UserDto> {
    const patch: Partial<User> = {
      username: user.username,
      lastSyncedAt: new Date(),
    };
    const entity = await this.userRepo.preload({
      auth0UserId: user.auth0UserId,
      ...patch,
    });
    if (!entity) {
      throw new NotFoundException(`User ${user.auth0UserId} not found`);
    }

    return this.userRepo.save(entity);
  }

  async getUsers(): Promise<Auth0UserDto[]> {
    const users = await this.userRepo.find();
    return users.map((user) => ({ ...user }));
  }

  async getAuth0User(auth0Id: string): Promise<Auth0UserDto | null> {
    const user = await this.userRepo.findOne({
      where: {
        auth0UserId: auth0Id,
      },
    });

    return user ? ({ ...user } as Auth0UserDto) : null;
  }

  async searchByUsername(
    query: string,
  ): Promise<{ username: string; auth0UserId: string }[]> {
    return this.userRepo.find({
      where: { username: Like(`%${query}%`) },
      select: { username: true, auth0UserId: true },
    });
  }
}
