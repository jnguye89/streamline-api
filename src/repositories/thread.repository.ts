import { InjectMapper } from "@automapper/nestjs";
import { Mapper } from "@automapper/core";
import { Injectable } from "@nestjs/common";
import { Thread } from "src/entity/thread.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ThreadDto } from "src/dto/thread.dto";

@Injectable()
export class ThreadRepository {
    constructor(
        @InjectMapper() private readonly mapper: Mapper,
        @InjectRepository(Thread) private readonly threadRepo: Repository<Thread>
    ) { }

    async getLatest(count: number): Promise<ThreadDto[]> {
        const results = await this.threadRepo.find({
            relations: { user: true },
            order: { createdAt: 'DESC' },
            take: count,
        });
        return this.mapper.mapArray(results, Thread, ThreadDto);
    }

    async createThread(threadDto: ThreadDto): Promise<ThreadDto> {
        const entity = this.mapper.map(threadDto, ThreadDto, Thread);
        const thread = this.threadRepo.create(entity);
        return this.mapper.map(await this.threadRepo.save(thread), Thread, ThreadDto);
    }
}