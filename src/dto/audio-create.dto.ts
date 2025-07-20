import { AutoMap } from '@automapper/classes';

export class AudioCreateDto {
  @AutoMap()
  user: string;
  @AutoMap()
  audioPath: string;
  @AutoMap()
  name: string | null;
}
