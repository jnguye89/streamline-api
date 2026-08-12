import { HttpService } from '@nestjs/axios';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

interface Auth0ErrorResponse {
  error?: string;
  error_description?: string;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

@Injectable()
export class DeviceAuthService {
  private readonly domain = `https://${process.env.AUTH0_DOMAIN}`;
  private readonly clientId = process.env.AUTH0_TV_CLIENT_ID;
  private readonly audience = process.env.AUTH0_AUDIENCE;

  constructor(private readonly http: HttpService) {}

  async initiateDeviceFlow() {
    const { data } = await firstValueFrom(
      this.http.post<DeviceCodeResponse>(`${this.domain}/oauth/device/code`, {
        client_id: this.clientId,
        scope: 'openid profile email offline_access use:tv',
        audience: this.audience,
      }),
    );
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete,
      expiresIn: data.expires_in,
      interval: data.interval,
    };
  }

  async pollForToken(deviceCode: string) {
    try {
      const { data } = await firstValueFrom(
        this.http.post<DeviceTokenResponse>(`${this.domain}/oauth/token`, {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: this.clientId,
        }),
      );

      return {
        status: 'complete',
        accessToken: data.access_token,
        idToken: data.id_token,
        refreshToken: data.refresh_token ?? null,
        expiresIn: data.expires_in,
        tokenType: data.token_type,
      };
    } catch (error: unknown) {
      const auth0Error = error as AxiosError<Auth0ErrorResponse>;
      const errorCode = auth0Error.response?.data?.error;

      if (errorCode === 'authorization_pending') {
        return { status: 'pending' };
      }
      if (errorCode === 'slow_down') {
        return { status: 'slow_down' };
      }
      if (errorCode === 'access_denied') {
        throw new HttpException('Access denied by user', HttpStatus.FORBIDDEN);
      }
      if (errorCode === 'expired_token') {
        throw new HttpException('Device code has expired', HttpStatus.GONE);
      }

      throw new HttpException(
        auth0Error.response?.data?.error_description ?? 'Auth0 error',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
