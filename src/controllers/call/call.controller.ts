import { Body, Controller, Post } from "@nestjs/common";
import { User } from "src/auth/user.decorator";
import { CreateAgoraTokenDto } from "src/dto/agora/agora-token.dto";
import { UserDto } from "src/dto/user.dto";
import { AgoraTokenService } from "src/services/third-party/agora/agora-token.service";

@Controller('call')
export class CallController {
    constructor(private agoraTokenService: AgoraTokenService) { }

    @Post('agora/token')
    create(@Body() dto: CreateAgoraTokenDto, @User() user: UserDto) {
        // In production, ignore incoming dto.uid and use the authenticated user id!
        // e.g. const uid = req.user.sub (Auth0)
        const { channel, ttlSeconds } = dto;
        return this.agoraTokenService.createTokens(user.userId, channel, ttlSeconds);
    }

}