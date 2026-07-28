import { StreamPlatform } from 'src/enums/stream-platform.enum';

export class StreamKeyDto {
  id?: number;
  userId!: string;
  platform!: StreamPlatform;
  streamKey!: string;
  streamUrl?: string;
}
