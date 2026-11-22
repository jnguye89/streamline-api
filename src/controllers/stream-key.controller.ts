import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { User } from 'src/auth/user.decorator';
import { UserModel } from 'src/models/user.model';
import { StreamKeyService } from 'src/services/stream-key.service';
import { StreamPlatform } from 'src/enums/stream-platform.enum';

@Controller('user/stream-keys')
export class StreamKeyController {
  constructor(private streamKeyService: StreamKeyService) {}

  @Get()
  async getStreamKeys(@User() user: UserModel) {
    return await this.streamKeyService.getStreamKeysByUserId(user.userId);
  }

  /** On or off for the next live: PATCH /user/stream-keys/kick { enabled: false } */
  @Patch(':platform')
  async setEnabled(
    @User() user: UserModel,
    @Param('platform') platform: StreamPlatform,
    @Body() body: { enabled: boolean },
  ) {
    return await this.streamKeyService.setEnabled(
      user.userId,
      platform,
      body?.enabled,
    );
  }

  @Post()
  async saveStreamKey(
    @User() user: UserModel,
    @Body()
    body: { platform: StreamPlatform; streamKey: string; streamUrl?: string },
  ) {
    return await this.streamKeyService.saveStreamKey(
      user.userId,
      body.platform,
      body.streamKey,
      body.streamUrl,
    );
  }
}
