import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Public } from "src/auth/public.decorator";
import { User } from "src/auth/user.decorator";
import { ThreadDto } from "src/dto/thread.dto";
import { UserDto } from "src/dto/user.dto";
import { ThreadService } from "src/services/thread.service";

@Controller('thread')
export class ThreadController {
    constructor(private readonly threadService: ThreadService) { }

    @Get(':count')
    @Public()
    async getThreads(@Param('count') count: number) {
        return await this.threadService.getLatest(count);
    }

    @Post()
    async createThread(@User() user: UserDto, @Body() dto: ThreadDto) {
        dto.auth0UserId = user.userId;
        return await this.threadService.createThread(dto);
    }
}