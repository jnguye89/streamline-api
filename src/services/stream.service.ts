import { Injectable } from "@nestjs/common";
import { StreamDto } from "src/dto/stream.dto";
import { StreamRepository } from "src/repositories/stream.repository";

@Injectable()
export class StreamService {
    constructor(private streamRepo: StreamRepository) { }

    async findAll(): Promise<StreamDto[]> {
        return await this.streamRepo.findAll();
    }

    async findStreams(isActive: boolean, isLive: boolean, count?: number): Promise<StreamDto[]>{
        return await this.streamRepo.findStream(isActive, isLive, count);
    }
}