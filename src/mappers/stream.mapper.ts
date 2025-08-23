import { createMap, Mapper, MappingProfile } from "@automapper/core";
import { AutomapperProfile, InjectMapper } from "@automapper/nestjs";
import { Injectable } from "@nestjs/common";
import { StreamDto } from "src/dto/stream.dto";
import { Stream } from "src/entity/stream.entity";

@Injectable()
export class StreamProfile extends AutomapperProfile {
    constructor(@InjectMapper() mapper: Mapper) {
        super(mapper);
    }

    override get profile(): MappingProfile {
        return (mapper) => {
            createMap(mapper, Stream, StreamDto);
            createMap(mapper, StreamDto, Stream);
        };
    }
}
