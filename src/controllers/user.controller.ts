import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "src/auth/public.decorator";
import { UserService } from "src/services/user.service";

@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) { }

    @Get()
    async getUsers() {
        return this.userService.getUsers();
    }

    @Get('auth0/:authId')
    async getAuth0User(@Param('authId') id: string) {
        return this.userService.getAuth0User(id)
    }

    @Get('agora/:agoraId')
    async getAgoraUser(@Param('agoraId') id: number) {
        return this.userService.getAgoraUser(id);
    }

    @Get('search')
    @Public()
    async search(@Query('q') query: string) {
        return this.userService.searchUsers(query);
    }

}