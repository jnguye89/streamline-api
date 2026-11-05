import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ageOn,
  MIN_ACCOUNT_AGE,
  MIN_GO_LIVE_AGE,
  parseBirthDate,
} from 'src/auth/age';

import { Auth0UserDto } from 'src/dto/auth0-user.dto';
import { ModerationRepository } from 'src/repositories/moderation.repository';
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

/** What anyone can see about a user: their name and photo (and the id calls use). */
export type PublicProfile = Pick<
  Auth0UserDto,
  'auth0UserId' | 'username' | 'picture' | 'agoraUserId'
>;

export function toPublicProfile(user: Auth0UserDto): PublicProfile {
  return {
    auth0UserId: user.auth0UserId,
    username: user.username,
    picture: user.picture ?? null,
    agoraUserId: user.agoraUserId,
  };
}

@Injectable()
export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly auth0Service: Auth0Service,
    private readonly s3Service: S3Service,
    private readonly moderationRepository: ModerationRepository,
  ) {}

  async getUser(auth0UserId: string): Promise<Auth0UserDto> {
    let user = await this.userRepo.getUser(auth0UserId);
    if (!user) {
      user = await this.createUser(auth0UserId);
    } else if (user.deletedAt) {
      // Already anonymized, and gone from Auth0, so there's nothing to resync.
      return user;
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

  /** A profile to show. Deleted accounts read as not found, like they never existed. */
  async getAuth0User(auth0Id: string): Promise<Auth0UserDto> {
    const user = await this.getUser(auth0Id);
    if (user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
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

  /** Matching users, minus anyone the viewer has blocked. */
  async searchUsers(
    query: string,
    viewerId?: string | null,
  ): Promise<{ username: string; auth0UserId: string }[]> {
    const [users, hidden] = await Promise.all([
      this.userRepo.searchByUsername(query),
      this.moderationRepository.hiddenFor(viewerId),
    ]);
    return users.filter((u) => !hidden.blockedUserIds.has(u.auth0UserId));
  }

  /** The signed-in user's own record, created on first use like any other lookup. */
  getMe(auth0UserId: string): Promise<Auth0UserDto> {
    return this.getUser(auth0UserId);
  }

  /**
   * Records their date of birth (YYYY-MM-DD) and returns their age. It's set once: changing
   * it afterwards would let someone talk their way past the go-live age, so that goes through
   * support. Saying the same date again is fine. Under-13s aren't stored; the caller removes
   * their account.
   */
  async setBirthDate(auth0UserId: string, input: unknown): Promise<number> {
    if (!parseBirthDate(input)) {
      throw new BadRequestException(
        'birthDate must be a real date as YYYY-MM-DD',
      );
    }
    const birthDate = (input as string).trim();
    const age = ageOn(birthDate);
    if (age < 0 || age > 120) {
      throw new BadRequestException('That birth date isn’t plausible');
    }
    const user = await this.getUser(auth0UserId);
    if (user.birthDate && user.birthDate !== birthDate) {
      throw new ConflictException(
        'Birth date is already set; contact support to change it',
      );
    }
    if (age >= MIN_ACCOUNT_AGE && !user.birthDate) {
      await this.userRepo.setBirthDate(auth0UserId, birthDate);
    }
    return age;
  }

  /** Throws unless they're old enough to broadcast. `code` tells the apps which message to show. */
  async assertCanGoLive(auth0UserId: string): Promise<void> {
    const { birthDate } = await this.getUser(auth0UserId);
    if (!birthDate) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'birthdate_required',
        message: 'Add your date of birth before going live',
      });
    }
    if (ageOn(birthDate) < MIN_GO_LIVE_AGE) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'too_young_to_go_live',
        message: `You need to be ${MIN_GO_LIVE_AGE} or older to go live`,
      });
    }
  }

  async acceptTerms(auth0UserId: string): Promise<Auth0UserDto> {
    await this.getUser(auth0UserId);
    await this.userRepo.acceptTerms(auth0UserId);
    return this.getUser(auth0UserId);
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
