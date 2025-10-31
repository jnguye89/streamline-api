import { AutoMap } from '@automapper/classes';

export class VideoDto {
  @AutoMap()
  user: string;
  @AutoMap()
  videoPath: string;
  @AutoMap()
  id?: number;
}
