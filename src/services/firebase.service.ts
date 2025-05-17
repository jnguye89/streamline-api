import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { Bucket } from '@google-cloud/storage';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private bucket: Bucket;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const saJson = process.env.FIREBASE_SA_B64;
    // console.log('json', saJson);
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(saJson!)),
      storageBucket: this.config.get<string>('FIREBASE_STORAGE_BUCKET'),
    });

    this.bucket = admin.storage().bucket();
  }

  getStorageBucket(): Bucket {
    return this.bucket;
  }

  async getAllVideos(): Promise<string[]> {
    const [files] = await this.bucket.getFiles({ prefix: 'videos/' }); // 'videos/' is optional path/folder
    return files.map(
      (file) =>
        `https://firebasestorage.googleapis.com/v0/b/${
          this.bucket.name
        }/o/${encodeURIComponent(file.name)}?alt=media`,
    );
  }
}
