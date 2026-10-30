import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AdminGuard } from 'src/auth/admin';
import { User } from 'src/auth/user.decorator';
import { UserModel } from 'src/models/user.model';
import {
  ModerationService,
  ReportInput,
} from 'src/services/moderation.service';

/** Reporting and blocking for everyone signed in, and acting on reports for admins. */
@Controller()
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  /** Body: { videoId } or { channelName }, plus reason and optional details. */
  @Post('report')
  @HttpCode(201)
  async report(@User() user: UserModel, @Body() body: ReportInput) {
    const report = await this.moderationService.report(user.userId, body);
    return { id: report.id };
  }

  @Get('blocks')
  async getBlockedUsers(@User() user: UserModel) {
    return this.moderationService.findBlockedUsers(user.userId);
  }

  @Post('blocks/:userId')
  @HttpCode(204)
  async block(@User() user: UserModel, @Param('userId') blockedId: string) {
    await this.moderationService.block(user.userId, blockedId);
  }

  @Delete('blocks/:userId')
  @HttpCode(204)
  async unblock(@User() user: UserModel, @Param('userId') blockedId: string) {
    await this.moderationService.unblock(user.userId, blockedId);
  }

  @Get('admin/reports')
  @UseGuards(AdminGuard)
  async getOpenReports() {
    return this.moderationService.findOpenReports();
  }

  /** Body: { action: 'dismiss' | 'remove' | 'ban' }. */
  @Post('admin/reports/:id/resolve')
  @UseGuards(AdminGuard)
  @HttpCode(204)
  async resolve(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { action?: unknown },
  ) {
    await this.moderationService.resolve(id, body?.action);
  }
}
