import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Auth0UserDto } from 'src/dto/auth0-user.dto';
import { UserRepository } from 'src/repositories/user.repository';
import { Auth0Service } from './third-party/auth0.service';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly auth0Service: Auth0Service,
  ) {}

  async getUser(auth0UserId: string): Promise<Auth0UserDto> {
    let user = await this.userRepo.getUser(auth0UserId);
    if (!user) {
      user = await this.createUser(auth0UserId);
    } else if (
      !user.lastSyncedAt ||
      user.lastSyncedAt < new Date(new Date().getTime() - 24 * 60 * 60 * 1000)
    ) {
      const auth0User = await this.auth0Service.getUser(auth0UserId);
      user = await this.userRepo.updateUser(auth0User);
    }
    return user;
  }

  async createUser(auth0UserId: string): Promise<Auth0UserDto> {
    const auth0User = (await this.auth0Service.getUser(auth0UserId)) as {
      username?: unknown;
    };
    if (typeof auth0User.username !== 'string' || !auth0User.username.trim()) {
      throw new BadGatewayException(
        'Auth0 user does not have a valid username',
      );
    }
    const username = auth0User.username;
    return this.createLocalUser(auth0UserId, username);
  }

  async createLocalUser(
    auth0UserId: string,
    username: string,
  ): Promise<Auth0UserDto> {
    const agoraUserId = Math.floor(Math.random() * 99_999_999) + 1;
    const user: Auth0UserDto = {
      username,
      auth0UserId,
      agoraUserId,
    };
    return await this.userRepo.createUser(user);
  }

  async getUsers(): Promise<Auth0UserDto[]> {
    return await this.userRepo.getUsers();
  }

  async getAuth0User(auth0Id: string): Promise<Auth0UserDto> {
    return this.getUser(auth0Id);
  }

  async findAuth0User(auth0Id: string): Promise<Auth0UserDto | null> {
    return this.userRepo.getAuth0User(auth0Id);
  }

  async getAgoraUser(agoraId: number): Promise<Auth0UserDto> {
    const user = await this.userRepo.getAgoraUser(agoraId);
    if (!user) {
      throw new NotFoundException('Agora user not found');
    }
    return user;
  }

  async searchUsers(
    query: string,
  ): Promise<{ username: string; auth0UserId: string }[]> {
    return this.userRepo.searchByUsername(query);
  }
}
