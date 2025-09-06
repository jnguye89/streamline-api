import { Injectable } from "@nestjs/common";
import { ThreadDto } from "src/dto/thread.dto";
import { ThreadRepository } from "src/repositories/thread.repository";

@Injectable()
export class ThreadService {
    constructor(private readonly threadRepo: ThreadRepository) { }

    async getLatest(count = 50) {
        return await this.threadRepo.getLatest(count);
    }

    async createThread(thread: ThreadDto) {
        return await this.threadRepo.createThread(thread);
    }
}