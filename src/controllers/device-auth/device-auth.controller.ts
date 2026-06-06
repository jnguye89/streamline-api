import { Controller, Post, Body } from '@nestjs/common';
import { Public } from 'src/auth/public.decorator';
import { DeviceAuthService } from 'src/services/device-auth.service';

@Controller('auth/device')
export class DeviceAuthController {
  constructor(private readonly deviceAuthService: DeviceAuthService) {}

  @Post('code')
  @Public()
  initiateDeviceFlow() {
    return this.deviceAuthService.initiateDeviceFlow();
  }

  @Post('token')
  @Public()
  pollForToken(@Body('deviceCode') deviceCode: string) {
    return this.deviceAuthService.pollForToken(deviceCode);
  }
}
