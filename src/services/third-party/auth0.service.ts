import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { Auth0UserDto } from 'src/dto/auth0-user.dto';

interface ManagementTokenResponse {
  access_token: string;
  expires_in: number;
}

interface ManagementUserResponse {
  user_id: string;
  username?: string;
  nickname?: string;
  name?: string;
  email?: string;
  picture?: string;
}

@Injectable()
export class Auth0Service {
  private mgmtToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private readonly http: HttpService) {}

  private async getToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.mgmtToken && now < this.tokenExpiry - 60) {
      return this.mgmtToken;
    }
    const { data } = await firstValueFrom(
      this.http.post<ManagementTokenResponse>(
        `${process.env.AUTH0_MGMT_URL}/oauth/token`,
        {
          client_id: process.env.AUTH0_MGMT_CLIENT_ID,
          client_secret: process.env.AUTH0_MGMT_CLIENT_SECRET,
          audience: process.env.AUTH0_MGMT_AUDIENCE,
          grant_type: 'client_credentials',
        },
      ),
    );
    this.mgmtToken = data.access_token;
    this.tokenExpiry = now + data.expires_in;
    return this.mgmtToken;
  }

  async getUser(auth0UserId: string): Promise<Auth0UserDto> {
    const token = await this.getToken();
    const { data } = await firstValueFrom(
      this.http.get<ManagementUserResponse>(
        `${process.env.AUTH0_MGMT_URL}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
    );

    const username = data.username ?? data.nickname ?? data.name ?? data.email;
    if (!data.user_id || !username) {
      throw new BadGatewayException(
        'Auth0 returned an incomplete user profile',
      );
    }

    return {
      auth0UserId: data.user_id,
      username,
    };
  }
}
