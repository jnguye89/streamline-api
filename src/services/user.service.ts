import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Auth0UserDto } from 'src/dto/auth0-user.dto';
import { UserRepository } from 'src/repositories/user.repository';
import { Auth0Service } from './third-party/auth0.service';
import { S3Service } from './third-party/s3.service';

/** Image types accepted as profile pictures (what phone photo pickers produce). */
export const PROFILE_PICTURE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
export const PROFILE_PICTURE_MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly auth0Service: Auth0Service,
    private readonly s3Service: S3Service,
  ) {}

  async getUser(auth0UserId: string): Promise<Auth0UserDto> {
    let user = await this.userRepo.getUser(auth0UserId);
    if (!user) {
      user = await this.createUser(auth0UserId);
    } else if (
      !user.lastSyncedAt ||
      user.lastSyncedAt <
        new Date(new Date().getTime() - 24 * 60 * 60 * 1000) ||
      // Records from before pictures were stored pick theirs up on the next lookup rather
      // than waiting out the daily resync. (Auth0 always has some picture, so this settles.)
      user.picture == null
    ) {
      const auth0User = await this.auth0Service.getUser(auth0UserId);
      user = await this.userRepo.updateUser(auth0User);
    }
    return user;
  }

  async createUser(auth0UserId: string): Promise<Auth0UserDto> {
    const auth0User = (await this.auth0Service.getUser(auth0UserId)) as {
      username?: unknown;
      picture?: string | null;
    };
    if (typeof auth0User.username !== 'string' || !auth0User.username.trim()) {
      throw new BadGatewayException(
        'Auth0 user does not have a valid username',
      );
    }
    const username = auth0User.username;
    return this.createLocalUser(auth0UserId, username, auth0User.picture);
  }

  async createLocalUser(
    auth0UserId: string,
    username: string,
    picture: string | null = null,
  ): Promise<Auth0UserDto> {
    const agoraUserId = Math.floor(Math.random() * 99_999_999) + 1;
    const user: Auth0UserDto = {
      username,
      auth0UserId,
      agoraUserId,
      picture,
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

  /**
   * Stores an uploaded image as the user's profile picture: S3 for the file, Auth0 for the
   * `picture` URL that the apps read from the user's profile.
   */
  async updatePicture(
    auth0UserId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ picture: string }> {
    if (!file) {
      throw new BadRequestException('Attach the image as a "file" form field');
    }
    if (!PROFILE_PICTURE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported image type ${file.mimetype}; use JPEG, PNG, WebP or HEIC`,
      );
    }

    const picture = await this.s3Service.uploadProfilePicture(file);
    try {
      await this.auth0Service.updatePicture(auth0UserId, picture);
    } catch (e) {
      throw new BadGatewayException(
        `Couldn't update the Auth0 profile picture: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    // Mirror it locally too, so other users see it now rather than after the daily resync.
    await this.userRepo.updatePicture(auth0UserId, picture);
    return { picture };
  }
}
