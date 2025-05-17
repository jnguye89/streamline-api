import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { Bucket } from '@google-cloud/storage';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private bucket: Bucket;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const saJson: string = this.config.get<string>('FIREBASE_SA_B64') || '';
    const json = JSON.parse(saJson) as { FIREBASE_SA_B64: string };
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(json.FIREBASE_SA_B64)),
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
