import { Injectable } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types'; // not 'mime'
import { Readable } from 'stream';
import { Upload } from '@aws-sdk/lib-storage';
import { LogService } from '../log.service';

@Injectable()
export class S3Service {
  private s3: S3Client;
  private readonly bucket = process.env.AWS_S3_BUCKET;

  constructor(private logService: LogService) {
    this.s3 = new S3Client({ region: process.env.AWS_REGION });
  }

  async uploadAudioToS3(file: Express.Multer.File): Promise<string> {
    const extension = mime.extension(file.mimetype as string);
    if (!extension) {
      this.logService.insertLog('Invalid mimetype', 's3Service,uploadAudioToS3');
      throw new Error('Invalid mimetype');
    }

    const key = `audio/${uuidv4()}.${extension}`;

    const uploadParams = {
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read' as ObjectCannedACL, // Optional: Set ACL to public-read if you want the file to be publicly accessible
    };

    await this.s3.send(new PutObjectCommand(uploadParams));

    return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }

  async listFiles(prefix = 'uploads'): Promise<string[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      });

      const response = await this.s3.send(command);
      const files = response.Contents?.filter(
        (item) => item.Key !== `${prefix}/`,
      );

      if (!files) return [];
      const signedUrls = await Promise.all(
        files.map((item) => {
          const getCmd = new GetObjectCommand({
            Bucket: this.bucket,
            Key: item.Key!,
          });
          return getSignedUrl(this.s3, getCmd, { expiresIn: 3600 }); // 1 hour
        }),
      );
      return signedUrls;
    } catch (error) {
      console.error('Error listing files from S3:', error);
      this.logService.insertLog(error, 's3Service.listFiles');
      throw error;
    }
  }

  async getSignedUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3, command, { expiresIn: 3600 }); // 1 hour
  }

  async streamUrlToS3(url: string, video_id: string, extension: string): Promise<string> {
    const prefix = 'uploads'
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      this.logService.insertLog(`Download failed: ${res.status}`, 's3Service.streamUrlToS3');
      throw new Error(`Download failed: ${res.status}`);
    }

    // Convert WHATWG ReadableStream -> Node Readable for AWS SDK
    const bodyStream = Readable.fromWeb(res.body as any);

    // const datePrefix = new Date().toISOString().slice(0, 10);
    const key = `uploads/wowza/${video_id}.${extension}`;

    const uploader = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: bodyStream,
        ContentType: 'video/mp4',
      },
      queueSize: 4, // parallel parts
      partSize: 8 * 1024 * 1024, // 8 MB parts
      leavePartsOnError: false,
    });

    await uploader.done();
    return key;
  }

  public async generateUploadUrl(
    fileName: string,
    mimeType: string,
  ): Promise<{ uploadUrl: string; key: string }> {
    const key = `uploads/${uuidv4()}-${fileName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      // ACL: 'public-read', // optional
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 600 }); // 10 min

    return { uploadUrl, key };
  }
}
