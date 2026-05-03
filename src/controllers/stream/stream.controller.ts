import { Body, Controller, Get, HttpCode, Post, Put } from "@nestjs/common";
import { User } from "src/auth/user.decorator";
import { UserDto } from "src/dto/user.dto";
import { StreamService } from "src/services/stream.service";
import { Public } from "src/auth/public.decorator";
import { Stream } from "src/entity/stream.entity";
import { AgoraTokenService } from "src/services/third-party/agora/agora-token.service";
import { AgoraStreamRepository } from "src/repositories/agora-stream.repository";
import { AgoraStream } from "src/entity/agora-stream.entity";
import { AgoraRecordingService } from "src/services/third-party/agora/agora-recording.service";
import { UserService } from "src/services/user.service";

@Controller('stream')
export default class StreamController {
    constructor(
        private streamService: StreamService,
        private agoraTokenService: AgoraTokenService,
        private agoraStreamRepository: AgoraStreamRepository,
        private agoraRecordingService: AgoraRecordingService,
        private userSevice: UserService
    ) { }

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
    async ensurAgoraReady(@User() user: UserDto, @Body() dto: { channelName: string; }) {
        const channelName = dto?.channelName;
        let stream = await this.agoraStreamRepository.findByChannelName(channelName);
        if (!stream) {
            stream = await this.agoraStreamRepository.createNew(channelName, user.userId);
        }
        var userSearch = await this.userSevice.getAuth0User(user.userId);
        if (!userSearch.agoraUserId) {
            throw new Error('User does not have an Agora User ID');
        }
        const tokens = await this.agoraTokenService.createTokens(userSearch.agoraUserId, channelName);
        return tokens;
    }

    @Put('publish')
    async publishStream(@User() user: UserDto, @Body() dto: { channelName: string; }) {
        const channelName = dto?.channelName;
        const stream = await this.agoraStreamRepository.findByChannelName(channelName);
        if (!stream) {
            throw new Error('Stream not found');
        }
        stream.status = 'live';
        await this.agoraStreamRepository.save(stream);
        await this.agoraRecordingService.getResourceId(channelName, user.userId);
        await this.agoraRecordingService.startRecording(channelName);
        return { ok: true };
    }

    @Post('heartbeat')
    @HttpCode(200)
    async heartbeat(@Body() dto: { channelName: string, uid?: string }) {
        await this.agoraStreamRepository.heartbeat(dto.channelName, dto.uid);
        return { ok: true, serverTime: new Date().toISOString() };
    }

    @Put('unpublish')
    async stopStream(@User() user: UserDto, @Body() dto: { channelName: string; }) {
        const channelName = dto?.channelName;
        const stream = await this.agoraStreamRepository.findByChannelName(channelName);
        if (!stream) {
            throw new Error('Stream not found');
        }
        // if (stream.user.auth0UserId !== user.userId) {
        //     throw new Error('Unauthorized');
        // }
        stream.status = 'ended';
        await this.agoraStreamRepository.save(stream);
        await this.agoraRecordingService.stopRecording(channelName);
        return { ok: true };
    }
}