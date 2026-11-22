import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { User } from 'src/auth/user.decorator';
import { UserModel } from 'src/models/user.model';
import { StreamPlatform } from 'src/enums/stream-platform.enum';
import { StreamKeyLinkService } from 'src/services/stream-key-link.service';

/**
 * Send a simulcast stream key from a phone to the TV with a short code.
 * Both sides must be signed in to the same account (see StreamKeyLinkService).
 *
 *   POST /user/stream-keys/link             { platform }             TV: get a code
 *   GET  /user/stream-keys/link/:code                                phone: what is it for
 *   POST /user/stream-keys/link/:code       { streamKey, streamUrl } phone: send the key
 *   GET  /user/stream-keys/link/:code/status                         TV: has it arrived
 */
@Controller('user/stream-keys/link')
export class StreamKeyLinkController {
  constructor(private readonly links: StreamKeyLinkService) {}

  @Post()
  create(@User() user: UserModel, @Body() body: { platform: StreamPlatform }) {
    return this.links.create(user.userId, body?.platform);
  }

  @Get(':code/status')
  status(@User() user: UserModel, @Param('code') code: string) {
    return this.links.status(user.userId, code);
  }

  @Get(':code')
  lookup(@User() user: UserModel, @Param('code') code: string) {
    return this.links.lookup(user.userId, code);
  }

  @Post(':code')
  submit(
    @User() user: UserModel,
    @Param('code') code: string,
    @Body() body: { streamKey: string; streamUrl?: string },
  ) {
    return this.links.submit(
      user.userId,
      code,
      body?.streamKey,
      body?.streamUrl,
    );
  }
}
