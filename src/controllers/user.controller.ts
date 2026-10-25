import { Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Public } from "src/auth/public.decorator";
import { User } from "src/auth/user.decorator";
import { UserModel } from "src/models/user.model";
import { PROFILE_PICTURE_MAX_BYTES, UserService } from "src/services/user.service";

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

    /**
     * Uploads the signed-in user's profile picture (multipart, field "file") and makes it
     * their Auth0 picture. Returns the new picture URL.
     */
    @Post('picture')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PROFILE_PICTURE_MAX_BYTES } }))
    async uploadPicture(@User() user: UserModel, @UploadedFile() file: Express.Multer.File) {
        return this.userService.updatePicture(user.userId, file);
    }

    @Get('search')
    @Public()
    async search(@Query('q') query: string) {
        return this.userService.searchUsers(query);
    }

}