import { createMap, Mapper, MappingProfile } from "@automapper/core";
import { AutomapperProfile, InjectMapper } from "@automapper/nestjs";
import { Injectable } from "@nestjs/common";
import { Auth0UserDto } from "src/dto/auth0-user.dto";
import { User } from "src/entity/user.entity";

@Injectable()
export class UserProfile extends AutomapperProfile {
    constructor(@InjectMapper() mapper: Mapper) { super(mapper) }

    override get profile(): MappingProfile {
        return (mapper) => {
            createMap(mapper, User, Auth0UserDto);
            createMap(mapper, Auth0UserDto, User);
        }
    }
}