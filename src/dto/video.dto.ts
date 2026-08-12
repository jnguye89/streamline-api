import { VideoStatus } from 'src/entity/video.entity';

export type VideoSource = 'S3' | 'YOUTUBE';

export class VideoDto {
  user!: string;
  videoPath!: string;
  id?: number;
  processedPath?: string;
  status?: VideoStatus;
  resumeTimestamp?: number;
  viewCount?: number;
  likeCount?: number;
  liked?: boolean;
  source?: VideoSource;
  title?: string;
  thumbnailUrl?: string;
  /** Set only for source: 'YOUTUBE' entries, which have no DB id. */
  externalId?: string;
  /** Set only for source: 'YOUTUBE' entries — link to the video on youtube.com, for a "watch on YouTube" link. videoPath is the embeddable URL to actually play it. */
  watchUrl?: string;
}
