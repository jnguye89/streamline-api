import { Injectable } from "@nestjs/common";
import { ThreadDto } from "src/dto/thread.dto";
import { ThreadRepository } from "src/repositories/thread.repository";
import { UserService } from "./user.service";

@Injectable()
export class ThreadService {
    constructor(private readonly threadRepo: ThreadRepository, private readonly userSerice: UserService) { }

    async getLatest(count = 50) {
        return await this.threadRepo.getLatest(count);
    }

    async createThread(thread: ThreadDto) {
        thread.user = await this.userSerice.getUser(thread.auth0UserId);
        return await this.threadRepo.createThread(thread);
    }
}