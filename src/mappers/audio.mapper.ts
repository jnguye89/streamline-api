import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, MappingProfile, type Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { Audio } from 'src/entity/audio.entity';
import { AudioDto } from 'src/dto/audio.dto';
import { AudioCreateDto } from 'src/dto/audio-create.dto';

@Injectable()
export class AudioProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {
      createMap(mapper, Audio, AudioDto);
      createMap(mapper, AudioCreateDto, Audio);
      createMap(mapper, AudioDto, Audio);
    };
  }
}
