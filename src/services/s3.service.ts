// src/aws/s3.service.ts
import { Injectable } from '@nestjs/common';
import { S3 } from 'aws-sdk';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private s3: S3;
  private bucket: string;

  constructor(private configService: ConfigService) {
    this.s3 = new S3({
      region: configService.get('AWS_REGION'),
    });
    this.bucket = configService.get('AWS_S3_BUCKET') || '';
  }
  // src/aws/s3.service.ts

  async getAllVideos(prefix = 'uploads/') {
    const result = await this.s3
      .listObjectsV2({
        Bucket: this.bucket,
        Prefix: prefix, // Optional: limits to only video folder
      })
      .promise();

    return result.Contents?.map((item) =>
      this.s3.getSignedUrl('getObject', {
        Bucket: this.bucket,
        Key: item.Key!,
        Expires: 3600, // optional: 1 hour access URL
      }),
    );
  }

  async uploadFile(file: Express.Multer.File) {
    const key = `uploads/${uuidv4()}-${file.originalname}`;

    const result = await this.s3
      .upload({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
      .promise();

    return {
      key,
      url: result.Location,
    };
  }
}
