import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, MappingProfile, type Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { User_Integration } from 'src/entity/user-integration.entity';
import { UserIntegrationDto } from 'src/dto/user-integration.dto';

@Injectable()
export class UserIntegratinProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {
      createMap(mapper, User_Integration, UserIntegrationDto);
      createMap(mapper, UserIntegrationDto, User_Integration);
    };
  }
}
