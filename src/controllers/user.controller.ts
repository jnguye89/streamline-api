import { Controller, Delete, Get, HttpCode, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { OptionalJwtAuthGuard } from "src/auth/optional-jwt-auth.guard";
import { OptionalUser } from "src/auth/optional-user.decorator";
import { Public } from "src/auth/public.decorator";
import { User } from "src/auth/user.decorator";
import { UserModel } from "src/models/user.model";
import { AccountDeletionService } from "src/services/account-deletion.service";
import { PROFILE_PICTURE_MAX_BYTES, UserService } from "src/services/user.service";

@Controller('user')
export class UserController {
    constructor(
        private readonly userService: UserService,
        private readonly accountDeletionService: AccountDeletionService,
    ) { }

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

    /**
     * Permanently deletes the signed-in user's account: their Auth0 login, videos, likes and
     * everything else of theirs (see AccountDeletionService).
     */
    /** The signed-in user's own record, including whether they've agreed to the terms. */
    @Get('me')
    async getMe(@User() user: UserModel) {
        return this.userService.getMe(user.userId);
    }

    /** Records that the signed-in user agreed to the terms of use. */
    @Post('me/terms')
    async acceptTerms(@User() user: UserModel) {
        return this.userService.acceptTerms(user.userId);
    }

    @Delete('me')
    @HttpCode(204)
    async deleteMe(@User() user: UserModel): Promise<void> {
        await this.accountDeletionService.deleteAccount(user.userId);
    }

    @Get('search')
    @Public()
    @UseGuards(OptionalJwtAuthGuard)
    async search(@OptionalUser() viewer: UserModel | null, @Query('q') query: string) {
        return this.userService.searchUsers(query, viewer?.userId);
    }

}