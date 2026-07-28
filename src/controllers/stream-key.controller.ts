import { Body, Controller, Get, Post } from '@nestjs/common';
import { User } from 'src/auth/user.decorator';
import { UserModel } from 'src/models/user.model';
import { StreamKeyService } from 'src/services/stream-key.service';
import { StreamPlatform } from 'src/enums/stream-platform.enum';

@Controller('user/stream-keys')
export class StreamKeyController {
  constructor(private streamKeyService: StreamKeyService) { }

  @Get()
  async getStreamKeys(@User() user: UserModel) {
    return await this.streamKeyService.getStreamKeysByUserId(user.userId);
  }

  @Post()
  async saveStreamKey(
    @User() user: UserModel,
    @Body() body: { platform: StreamPlatform; streamKey: string; streamUrl?: string },
  ) {
    return await this.streamKeyService.saveStreamKey(
      user.userId,
      body.platform,
      body.streamKey,
      body.streamUrl,
    );
  }
}
