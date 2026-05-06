import { VideoStatus } from 'src/entity/video.entity';

export class VideoDto {
  user!: string;
  videoPath!: string;
  id?: number;
  processedPath?: string;
  status?: VideoStatus;
}
