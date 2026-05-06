import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import ffmpeg from 'fluent-ffmpeg';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { VideoRepository } from 'src/repositories/video.repository';
import { VideoStatus } from 'src/entity/video.entity';

@Processor('video-processing', {
  lockDuration: 300_000,  // 5 min — covers large file download + transcode
  lockRenewTime: 120_000, // renew lock every 2 min
})
export class VideoProcessingProcessor extends WorkerHost {
  private s3: S3Client;
  private bucket: string;

  constructor(private videoRepository: VideoRepository) {
    super();
    this.bucket = process.env.AWS_S3_BUCKET!;
    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
    });
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

    const originalKey = `videos/original/${videoId}`;
    const processedKey = `videos/processed/${videoId}`;

    const tempDir = path.join(process.cwd(), 'tmp');
    fs.mkdirSync(tempDir, { recursive: true });

    const inputPath = path.join(tempDir, `${videoId.split('.')[0]}-input.mp4`);
    const outputPath = path.join(tempDir, `${videoId.split('.')[0]}-processed.mp4`);

    try {
      await this.videoRepository.updateProcessingStatus(originalKey, VideoStatus.PROCESSING);

      console.log('Downloading from S3...');
      await this.downloadFromS3(originalKey, inputPath);

      console.log('Running FFmpeg...');
      await this.runFfmpeg(inputPath, outputPath);

      console.log('Uploading processed video...');
      await this.uploadToS3(outputPath, processedKey);

      await this.videoRepository.updateProcessingStatus(originalKey, VideoStatus.COMPLETED, processedKey);
      console.log('Done:', processedKey);
    } catch (err) {
      console.error('Video processing failed for key:', originalKey, err);
      await this.videoRepository.updateProcessingStatus(originalKey, VideoStatus.FAILED);
      throw err;
    } finally {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  }

  private async downloadFromS3(key: string, localPath: string) {
    console.log('Downloading S3 object:', key);
    const result = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
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

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
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
