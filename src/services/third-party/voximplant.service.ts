import { Injectable } from '@nestjs/common';
import { VoxAuthService } from './vox-auth.service';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class VoximplantService {
  constructor(
    private readonly auth: VoxAuthService,
    private readonly http: HttpService,
  ) {}

  public async createvoxImplantUser(
    userId: string,
    password: string,
  ): Promise<any> {
    const token = this.auth.getToken();
    const user = await firstValueFrom(
      this.http.post(
        `https://api.voximplant.com/platform_api/AddUser/?user_name=${userId}&user_display_name=${userId}&user_password=${password}&application_id=10975702`,
        null,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    );
    return user;
  }

  public async getVoxImplantUser(userId: string): Promise<any> {
    const token = this.auth.getToken();
    const user = await firstValueFrom(
      this.http.get(
        `https://api.voximplant.com/platform_api/GetUsers/?application_id=10975702&count=1&username=${userId.split('|')[1]}`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    );
    return user.data;
  }
}
