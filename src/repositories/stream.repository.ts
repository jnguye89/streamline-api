import { HttpException, Injectable } from "@nestjs/common";
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from "@automapper/core";
import { InjectRepository } from "@nestjs/typeorm";
import { Stream } from "src/entity/stream.entity";
import { Repository } from "typeorm";
import { StreamDto } from "src/dto/stream.dto";

@Injectable()
export class StreamRepository {
    constructor(@InjectMapper() private readonly mapper: Mapper, @InjectRepository(Stream) private readonly streamRepo: Repository<Stream>) { }

    async findAll(): Promise<StreamDto[]> {
        const entity = await this.streamRepo.find();
        const mapped = this.mapper.mapArray(entity, Stream, StreamDto);
        return mapped;
    }

    async findStream(isActive: boolean, isLive: boolean, count?: number): Promise<StreamDto[]> {
        const entity = await this.streamRepo.find({
            // where: {
            //     isActive,
            //     isLive
            // },
            take: count
        })
        return this.mapper.mapArray(entity, Stream, StreamDto);
    }

    // async create(streamDto: StreamDto): Promise<StreamDto> {
    //     // const entity = this.mapper
    //     const video = this.streamRepo.create(
    //         this.mapper.map(streamDto, StreamDto, Stream),
    //     );
    //     return this.mapper.map(await this.streamRepo.save(streamDto), Stream, StreamDto);
    // }

    async updateStreamStatus(wowzaId: string, isActive: boolean, isLive: boolean): Promise<StreamDto> {
        const entity = await this.streamRepo.findOne({
            where: {
                wowzaId
            }
        });
        if (entity == null) throw new HttpException(`Srream not found`, 401);
        // entity.isActive = isActive;
        // entity.isLive = isLive;
        const stream = await this.streamRepo.save(entity);
        return this.mapper.map(stream, Stream, StreamDto);
    }
}