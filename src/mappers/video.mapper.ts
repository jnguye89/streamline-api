import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import {
  createMap,
  forMember,
  mapFrom,
  MappingProfile,
  type Mapper,
} from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { Video } from 'src/entity/video.entity';
import { VideoDto } from 'src/dto/video.dto';

@Injectable()
export class VideoProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {
      createMap(
        mapper,
        Video,
        VideoDto,
        forMember(
          (d) => d.user,
          mapFrom((s) => s.user),
        ),
        forMember(
          (d) => d.videoPath,
          mapFrom((s) => s.videoPath),
        ),
      );
      createMap(mapper, VideoDto, Video);
    };
  }
}
