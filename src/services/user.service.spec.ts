import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { Auth0UserDto } from 'src/dto/auth0-user.dto';
import { UserRepository } from 'src/repositories/user.repository';
import { Auth0Service } from './third-party/auth0.service';
import { S3Service } from './third-party/s3.service';
import { UserService } from './user.service';

describe('UserService', () => {
  const auth0UserId = 'google-oauth2|104069028515521279772';

  it('provisions an Auth0 user when the local user does not exist', async () => {
    const userRepo = {
      getUser: jest.fn().mockResolvedValue(undefined),
      createUser: jest
        .fn()
        .mockImplementation(
          (user: Auth0UserDto): Promise<Auth0UserDto> => Promise.resolve(user),
        ),
    };
    const auth0Service = {
      getUser: jest.fn().mockResolvedValue({ username: 'streamer' }),
    };
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: userRepo },
        { provide: Auth0Service, useValue: auth0Service },
        { provide: S3Service, useValue: {} },
      ],
    }).compile();
    const service = module.get(UserService);

    const user = await service.getAuth0User(auth0UserId);

    expect(user).toEqual(
      expect.objectContaining({
        auth0UserId,
        username: 'streamer',
      }),
    );
    expect(userRepo.createUser).toHaveBeenCalledTimes(1);
  });

  describe('updatePicture', () => {
    const pictureUrl =
      'https://bucket.s3.us-west-1.amazonaws.com/avatars/abc.jpeg';
    const image = {
      mimetype: 'image/jpeg',
      buffer: Buffer.from('jpeg'),
    } as Express.Multer.File;

    async function setup(
      updatePicture = jest.fn().mockResolvedValue(undefined),
    ) {
      const s3Service = {
        uploadProfilePicture: jest.fn().mockResolvedValue(pictureUrl),
      };
      const auth0Service = { updatePicture };
      const userRepo = {
        updatePicture: jest.fn().mockResolvedValue(undefined),
      };
      const module = await Test.createTestingModule({
        providers: [
          UserService,
          { provide: UserRepository, useValue: userRepo },
          { provide: Auth0Service, useValue: auth0Service },
          { provide: S3Service, useValue: s3Service },
        ],
      }).compile();
      return {
        service: module.get(UserService),
        s3Service,
        auth0Service,
        userRepo,
      };
    }

    it('uploads the image and sets it as the Auth0 picture', async () => {
      const { service, s3Service, auth0Service, userRepo } = await setup();

      const result = await service.updatePicture(auth0UserId, image);

      expect(result).toEqual({ picture: pictureUrl });
      expect(s3Service.uploadProfilePicture).toHaveBeenCalledWith(image);
      expect(auth0Service.updatePicture).toHaveBeenCalledWith(
        auth0UserId,
        pictureUrl,
      );
      // Stored locally too, so other users see it without waiting for a resync.
      expect(userRepo.updatePicture).toHaveBeenCalledWith(
        auth0UserId,
        pictureUrl,
      );
    });

    it('rejects a request without a file', async () => {
      const { service, s3Service } = await setup();

      await expect(
        service.updatePicture(auth0UserId, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(s3Service.uploadProfilePicture).not.toHaveBeenCalled();
    });

    it('rejects files that are not supported images', async () => {
      const { service, s3Service } = await setup();
      const pdf = { ...image, mimetype: 'application/pdf' };

      await expect(
        service.updatePicture(auth0UserId, pdf),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(s3Service.uploadProfilePicture).not.toHaveBeenCalled();
    });

    it('reports a bad gateway when Auth0 refuses the update', async () => {
      const { service } = await setup(
        jest.fn().mockRejectedValue(new Error('Insufficient scope')),
      );

      await expect(
        service.updatePicture(auth0UserId, image),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  it('resyncs a recently synced user who has no stored picture yet', async () => {
    const picture = 'https://example.com/me.png';
    const userRepo = {
      getUser: jest.fn().mockResolvedValue({
        auth0UserId,
        username: 'streamer',
        lastSyncedAt: new Date(),
        picture: null,
      }),
      updateUser: jest
        .fn()
        .mockImplementation(
          (user: Auth0UserDto): Promise<Auth0UserDto> => Promise.resolve(user),
        ),
    };
    const auth0Service = {
      getUser: jest
        .fn()
        .mockResolvedValue({ auth0UserId, username: 'streamer', picture }),
    };
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: userRepo },
        { provide: Auth0Service, useValue: auth0Service },
        { provide: S3Service, useValue: {} },
      ],
    }).compile();

    const user = await module.get(UserService).getAuth0User(auth0UserId);

    expect(auth0Service.getUser).toHaveBeenCalledWith(auth0UserId);
    expect(user.picture).toBe(picture);
  });
});
