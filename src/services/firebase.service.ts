import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { Bucket } from '@google-cloud/storage';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private bucket: Bucket;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const privateKey = this.config
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.config.get<string>('FIREBASE_PROJECT_ID'),
          clientEmail: this.config.get<string>('FIREBASE_CLIENT_EMAIL'),
          privateKey,
        }),
        storageBucket: this.config.get<string>('FIREBASE_STORAGE_BUCKET'),
      });

      this.bucket = admin.storage().bucket();
    }
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
