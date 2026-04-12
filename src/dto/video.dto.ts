export class VideoDto {
  user: string;
  videoPath: string;
  id?: number;
  type?: 'podcast' | 'stream' | 'upload';
}
