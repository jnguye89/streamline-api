import { Injectable } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private s3: S3Client;
  private readonly bucket = process.env.AWS_S3_BUCKET;

  constructor() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION });
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
      throw error;
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    key: string,
    mimeType: string,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: `uploads/${uuidv4()}-${key}`,
        Body: fileBuffer,
        ContentType: mimeType,
      });

      await this.s3.send(command);

      return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw error;
    }
  }
}
