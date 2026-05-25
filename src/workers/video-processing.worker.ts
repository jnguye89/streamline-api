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

  /**
   * Keep these values conservative.
   * Strong filters can make user-uploaded videos look unnatural.
   */
  private readonly ffmpegSettings = {
    audio: {
      noiseReduction: true,

      // 1.0 = unchanged
      // 1.2 = 20% louder
      // 0.8 = 20% quieter
      volume: 1.0,

      // Loudness normalization settings
      loudnessTarget: -16,
      truePeak: -1.5,
      loudnessRange: 11,
    },

    video: {
      stabilization: true,

      // brightness range is roughly -1.0 to 1.0
      brightness: 0.03,

      // 1.0 = unchanged
      contrast: 1.08,

      // 1.0 = unchanged
      saturation: 1.10,

      // 1.0 = unchanged
      gamma: 1.0,
    },

    output: {
      crf: 23,
      preset: 'medium',
    },
  };

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

    await this.processVideo(videoId, String(job.id ?? Date.now()));
  }

  private async processVideo(videoId: string, jobId: string) {
    if (!videoId) {
      throw new Error('Missing videoId argument');
    }

    const originalKey = `videos/original/${videoId}`;

    /**
     * Since FFmpeg is always outputting MP4, make sure the processed key is also .mp4.
     * This avoids storing MP4 content under a misleading .mov/.webm/etc. key.
     */
    const parsedVideo = path.parse(path.basename(videoId));
    const safeBaseName = parsedVideo.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const processedFileName = `${safeBaseName}.mp4`;
    const processedKey = `videos/processed/${processedFileName}`;

    const tempDir = path.join(process.cwd(), 'tmp');
    fs.mkdirSync(tempDir, { recursive: true });

    const uniquePrefix = `${safeBaseName}-${jobId}-${Date.now()}`;
    const inputPath = path.join(tempDir, `${uniquePrefix}-input${parsedVideo.ext || '.mp4'}`);
    const outputPath = path.join(tempDir, `${uniquePrefix}-processed.mp4`);

    try {
      await this.videoRepository.updateProcessingStatus(
        originalKey,
        VideoStatus.PROCESSING,
      );

      console.log('Downloading from S3...');
      await this.downloadFromS3(originalKey, inputPath);

      console.log('Running FFmpeg...');
      await this.runFfmpeg(inputPath, outputPath);

      console.log('Uploading processed video...');
      await this.uploadToS3(outputPath, processedKey);

      await this.videoRepository.updateProcessingStatus(
        originalKey,
        VideoStatus.COMPLETED,
        processedKey,
      );

      console.log('Done:', processedKey);
    } catch (err) {
      console.error('Video processing failed for key:', originalKey, err);

      await this.videoRepository.updateProcessingStatus(
        originalKey,
        VideoStatus.FAILED,
      );

      throw err;
    } finally {
      this.safeDeleteFile(inputPath);
      this.safeDeleteFile(outputPath);
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

    await pipeline(
      result.Body as NodeJS.ReadableStream,
      fs.createWriteStream(localPath),
    );
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

  private buildAudioFilters(): string[] {
    const filters: string[] = [];

    if (this.ffmpegSettings.audio.noiseReduction) {
      filters.push('afftdn');
    }

    /**
     * Increase/decrease volume.
     * Keep this before loudnorm so loudnorm can normalize the final loudness after volume adjustment.
     */
    filters.push(`volume=${this.ffmpegSettings.audio.volume}`);

    /**
     * Normalize volume/loudness.
     * I = integrated loudness target
     * TP = true peak limit
     * LRA = loudness range
     */
    filters.push(
      [
        `loudnorm=I=${this.ffmpegSettings.audio.loudnessTarget}`,
        `TP=${this.ffmpegSettings.audio.truePeak}`,
        `LRA=${this.ffmpegSettings.audio.loudnessRange}`,
      ].join(':'),
    );

    return filters;
  }

  private buildVideoFilters(): string[] {
    const filters: string[] = [];

    /**
     * Simple one-pass stabilization.
     * Good enough for mild shake.
     *
     * For stronger stabilization later, replace this with a two-pass
     * vidstabdetect + vidstabtransform implementation.
     */
    if (this.ffmpegSettings.video.stabilization) {
      filters.push('deshake');
    }

    /**
     * Brightness / contrast / color correction.
     *
     * brightness: -1.0 to 1.0
     * contrast: 1.0 is unchanged
     * saturation: 1.0 is unchanged
     * gamma: 1.0 is unchanged
     */
    filters.push(
      [
        `eq=brightness=${this.ffmpegSettings.video.brightness}`,
        `contrast=${this.ffmpegSettings.video.contrast}`,
        `saturation=${this.ffmpegSettings.video.saturation}`,
        `gamma=${this.ffmpegSettings.video.gamma}`,
      ].join(':'),
    );

    return filters;
  }

  private async runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters(this.buildAudioFilters())
        .videoFilters(this.buildVideoFilters())
        .videoCodec('libx264')
        .audioCodec('aac')
        .format('mp4')
        .outputOptions([
          `-crf ${this.ffmpegSettings.output.crf}`,
          `-preset ${this.ffmpegSettings.output.preset}`,

          // Makes the MP4 start faster in browsers.
          '-movflags +faststart',

          // Better compatibility with browser/video players.
          '-pix_fmt yuv420p',
        ])
        .on('start', (cmd) => {
          console.log('FFmpeg started:', cmd);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`FFmpeg progress: ${progress.percent.toFixed(2)}%`);
          }
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .on('end', () => {
          console.log('FFmpeg completed:', outputPath);
          resolve();
        })
        .save(outputPath);
    });
  }

  private safeDeleteFile(filePath: string) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn('Failed to delete temp file:', filePath, err);
    }
  }
}