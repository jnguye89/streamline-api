import { Test } from '@nestjs/testing';

import { Auth0UserDto } from 'src/dto/auth0-user.dto';
import { UserRepository } from 'src/repositories/user.repository';
import { Auth0Service } from './third-party/auth0.service';
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
});
