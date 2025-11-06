import { Body, Controller, Post } from "@nestjs/common";
import { User } from "src/auth/user.decorator";
import { CreateAgoraTokenDto } from "src/dto/agora/agora-token.dto";
import { UserDto } from "src/dto/user.dto";
import { AgoraRecordingService } from "src/services/third-party/agora/agora-recording.service";
import { AgoraTokenService } from "src/services/third-party/agora/agora-token.service";
import { UserService } from "src/services/user.service";

@Controller('call')
export class CallController {
    constructor(private agoraTokenService: AgoraTokenService, private agoraRecordingService: AgoraRecordingService, private userService: UserService) { }

    @Post('agora/token')
    async create(@Body() dto: CreateAgoraTokenDto, @User() user: UserDto) {
        // In production, ignore incoming dto.uid and use the authenticated user id!
        // e.g. const uid = req.user.sub (Auth0)
        const { channel, ttlSeconds } = dto;
        return await this.agoraTokenService.createTokens(user.userId, channel, ttlSeconds);
    }

    @Post('podcast/start')
    async startPodcast(@Body() dto: { channelName: string }, @User() user: UserDto) {
        // console.log('starting recording');
        await this.agoraRecordingService.getResourceId(dto.channelName, user.userId);
        await this.agoraRecordingService.startRecording(dto.channelName);
    }

    @Post('podcast/stop')
    async stopPodcast(@Body() dto: { channelName: string }) {
        console.log('stopping recording');
        await this.agoraRecordingService.stopRecording(dto.channelName);
    }
}