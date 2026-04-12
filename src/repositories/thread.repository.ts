import { Injectable } from "@nestjs/common";
import { Thread } from "src/entity/thread.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ThreadDto } from "src/dto/thread.dto";

@Injectable()
export class ThreadRepository {
    constructor(
        @InjectRepository(Thread) private readonly threadRepo: Repository<Thread>
    ) { }

    async getLatest(count: number): Promise<ThreadDto[]> {
        const results = await this.threadRepo.find({
            relations: { user: true },
            order: { createdAt: 'DESC' },
            take: count,
        });
        return [...results.map(e => { return { ...e } as ThreadDto })];
    }

    async createThread(threadDto: ThreadDto): Promise<ThreadDto> {
        const entity = { ...threadDto };
        const thread = this.threadRepo.create(entity);
        const result = await this.threadRepo.save(thread);
        return { ...result };
    }
}