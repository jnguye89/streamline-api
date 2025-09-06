import { createMap, Mapper, MappingProfile } from "@automapper/core";
import { AutomapperProfile, InjectMapper } from "@automapper/nestjs";
import { Injectable } from "@nestjs/common";
import { ThreadDto } from "src/dto/thread.dto";
import { Thread } from "src/entity/thread.entity";

@Injectable()
export class ThreadProfile extends AutomapperProfile {
    constructor(@InjectMapper() mapper: Mapper) {
        super(mapper);
    }

    override get profile(): MappingProfile {
        return (mapper) => {
            createMap(mapper, Thread, ThreadDto);
            createMap(mapper, ThreadDto, Thread);
        };
    }
}
