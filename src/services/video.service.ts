import { Injectable } from '@nestjs/common';
import { FirebaseService } from './firebase.service';

@Injectable()
export class VideoService {
  constructor(private firebaseService: FirebaseService) {}

  async getAllVideos(): Promise<string[]> {
    return await this.firebaseService.getAllVideos();
  }

  async uploadVideo(file: Express.Multer.File): Promise<string> {
    const blob = this.firebaseService
      .getStorageBucket()
      .file(`videos/${file.originalname}`);
    const stream = blob.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
    });

    return new Promise((resolve, reject) => {
      stream.on('error', (err) => {
        console.error('Error uploading video:', err);
        reject(err);
      });

      stream.on('finish', async () => {
        try {
          const [signedUrl] = await blob.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 60 * 60 * 1000, // 60 minutes
          });
          resolve(signedUrl);
        } catch (err) {
          reject(err);
        }
      });

      stream.end(file.buffer);
    });
  }
}
