import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import ffmpeg from 'fluent-ffmpeg';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { VideoRepository } from 'src/repositories/video.repository';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
});

const bucket = process.env.AWS_S3_BUCKET!;

@Processor('video-processing')
export class VideoProcessingProcessor extends WorkerHost {
  constructor(private videoRepository: VideoRepository) {
    super();
  }
  async process(job: Job<{ videoId: string }>) {
    const { videoId } = job.data;

    console.log('Processing video:', videoId);

    // Reuse the same logic from your manual worker:
    // 1. build original key
    // 2. download from S3
    // 3. run FFmpeg
    // 4. upload processed video
    // 5. update DB

    await this.processVideo(videoId);
  }

  private async processVideo(videoId: string) {
    if (!videoId) {
      throw new Error('Missing videoId argument');
    }

    const originalKey = `videos/original/${videoId}.mp4`;
    const processedKey = `videos/processed/${videoId}.mp4`;

    const tempDir = path.join(process.cwd(), 'tmp');
    fs.mkdirSync(tempDir, { recursive: true });

    const inputPath = path.join(tempDir, `${videoId}-input.mp4`);
    const outputPath = path.join(tempDir, `${videoId}-processed.mp4`);

    try {
      console.log('Downloading from S3...');
      console.log(originalKey, inputPath);
      await this.downloadFromS3(originalKey, inputPath);

      // this.videoRepository.
      console.log('Running FFmpeg...');
      await this.runFfmpeg(inputPath, outputPath);

      console.log('Uploading processed video...');
      await this.uploadToS3(outputPath, processedKey);

      // TODO: Update video repository with processed video path
      // need a new column with this property or just override the existing one?
      // await this.videoRepository.updateVideoPath(videoId, processedKey);
      console.log('Done:', processedKey);
    } finally {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  }

  private async downloadFromS3(key: string, localPath: string) {
    console.log(bucket);
    console.log(key);
    // key = 'videos/original/4d79de1c1642d46584603ba8571f75f2_host-0amnjke8c87l_0.mp4';
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!result.Body) {
      throw new Error('No S3 body returned');
    }

    await pipeline(result.Body as NodeJS.ReadableStream, fs.createWriteStream(localPath));
  }

  private async uploadToS3(localPath: string, key: string) {
    const fileStream = fs.createReadStream(localPath);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileStream,
        ContentType: 'video/mp4',
      }),
    );
  }

  async runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters([
          'afftdn',     // noise reduction
          'loudnorm',   // loudness normalization
        ])
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-crf 23',
          '-preset medium',
          '-movflags +faststart',
        ])
        .on('start', (cmd) => {
          console.log('FFmpeg started:', cmd);
        })
        .on('error', reject)
        .on('end', () => resolve())
        .save(outputPath);
    });
  }
}
