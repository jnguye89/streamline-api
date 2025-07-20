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

@Injectable()
export class S3Service {
  private s3: S3Client;
  private readonly bucket = process.env.AWS_S3_BUCKET;

  constructor() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION });
  }

  async uploadAudioToS3(file: Express.Multer.File): Promise<string> {
    const extension = mime.extension(file.mimetype as string);
    if (!extension) throw new Error('Invalid mimetype');

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
      throw error;
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    key: string,
    mimeType: string,
  ): Promise<string> {
    try {
      const file = `uploads/${uuidv4()}-${key}`;
      const stream = Readable.from(fileBuffer);
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: file,
        Body: stream,
        ContentType: mimeType,
        ContentLength: fileBuffer.length, // <- required for buffer uploads
      });

      await this.s3.send(command);
      return file;
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw error;
      // return 'this is a test url';
    }
  }

  async getSignedUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3, command, { expiresIn: 3600 }); // 1 hour
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
