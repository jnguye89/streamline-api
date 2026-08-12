import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Put,
} from '@nestjs/common';

import { Public } from 'src/auth/public.decorator';
import { User } from 'src/auth/user.decorator';
import { UserDto } from 'src/dto/user.dto';
import { AgoraStream } from 'src/entity/agora-stream.entity';
import { Stream } from 'src/entity/stream.entity';
import { AgoraStreamRepository } from 'src/repositories/agora-stream.repository';
import { StreamService } from 'src/services/stream.service';
import { AgoraRecordingService } from 'src/services/third-party/agora/agora-recording.service';
import { AgoraTokenService } from 'src/services/third-party/agora/agora-token.service';
import { UserService } from 'src/services/user.service';

@Controller('stream')
export default class StreamController {
  private readonly cloudRecordingEnabled =
    process.env.AGORA_CLOUD_RECORDING_ENABLED !== 'false';

  constructor(
    private streamService: StreamService,
    private agoraTokenService: AgoraTokenService,
    private agoraStreamRepository: AgoraStreamRepository,
    private agoraRecordingService: AgoraRecordingService,
    private userService: UserService,
  ) {}

  @Get()
  @Public()
  async getStreams(): Promise<Stream[]> {
    return await this.streamService.getStreams();
  }

  @Get('agora')
  @Public()
  async getAgoraStreams(): Promise<AgoraStream[]> {
    return await this.agoraStreamRepository.findAll();
  }

  @Post('ensure')
  async ensureAgoraReady(
    @User() user: UserDto,
    @Body() dto: { channelName: string },
  ) {
    const channelName = this.requireChannelName(dto?.channelName);
    let userSearch = await this.userService.findAuth0User(user.userId);
    if (!userSearch?.auth0UserId) {
      userSearch = await this.userService.createLocalUser(
        user.userId,
        user.userId,
      );
    }
    if (!userSearch.agoraUserId) {
      throw new BadRequestException('User does not have an Agora user ID');
    }

    let stream =
      await this.agoraStreamRepository.findByChannelName(channelName);
    if (!stream) {
      stream = await this.agoraStreamRepository.createNew(
        channelName,
        userSearch.auth0UserId,
      );
    } else if (stream.user.auth0UserId !== user.userId) {
      throw new ForbiddenException('Stream belongs to another user');
    }

    const tokens = await this.agoraTokenService.createTokens(
      userSearch.agoraUserId,
      channelName,
    );
    return tokens;
  }

  @Put('publish')
  async publishStream(
    @User() user: UserDto,
    @Body() dto: { channelName: string },
  ) {
    const channelName = this.requireChannelName(dto?.channelName);
    const stream =
      await this.agoraStreamRepository.findByChannelName(channelName);
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }
    if (stream.user.auth0UserId !== user.userId) {
      throw new ForbiddenException('Stream belongs to another user');
    }
    stream.status = 'live';
    await this.agoraStreamRepository.save(stream);
    if (this.cloudRecordingEnabled) {
      await this.agoraRecordingService.getResourceId(channelName, user.userId);
      await this.agoraRecordingService.startRecording(channelName);
    }
    return { ok: true };
  }

  @Post('heartbeat')
  @HttpCode(200)
  async heartbeat(@User() user: UserDto, @Body() dto: { channelName: string }) {
    const channelName = this.requireChannelName(dto?.channelName);
    const stream =
      await this.agoraStreamRepository.findByChannelName(channelName);
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }
    if (stream.user.auth0UserId !== user.userId) {
      throw new ForbiddenException('Stream belongs to another user');
    }
    await this.agoraStreamRepository.heartbeat(channelName);
    return { ok: true, serverTime: new Date().toISOString() };
  }

  @Put('unpublish')
  async stopStream(
    @User() user: UserDto,
    @Body() dto: { channelName: string },
  ) {
    const channelName = this.requireChannelName(dto?.channelName);
    const stream =
      await this.agoraStreamRepository.findByChannelName(channelName);
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }
    if (stream.user.auth0UserId !== user.userId) {
      throw new ForbiddenException('Stream belongs to another user');
    }
    stream.status = 'ended';
    await this.agoraStreamRepository.save(stream);
    const filename = this.cloudRecordingEnabled
      ? await this.agoraRecordingService.stopRecording(channelName)
      : undefined;
    return { filename, ok: true };
  }

  @Post('process')
  async processVideo(@Body() dto: { fileName: string }) {
    if (!dto?.fileName?.trim()) {
      throw new BadRequestException('fileName is required');
    }
    await this.agoraRecordingService.processVideo(dto.fileName);
    return { ok: true };
  }

  private requireChannelName(channelName: string | undefined): string {
    const value = channelName?.trim();
    if (!value) {
      throw new BadRequestException('channelName is required');
    }
    return value;
  }
}
