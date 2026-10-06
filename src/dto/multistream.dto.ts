import { MultistreamStatus } from 'src/entity/multistream.entity';
import { StreamPlatform } from 'src/enums/stream-platform.enum';

export class MultistreamStatusDto {
  platform!: StreamPlatform;
  status!: MultistreamStatus;
  error?: string;
}
