import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { VideoController } from './controllers/video/video.controller';
import { ConfigModule } from '@nestjs/config';
import { VideoService } from './services/video.service';
import { FirebaseModule } from './modules/firebase.module';
import { HttpModule } from '@nestjs/axios';
import { ListenController } from './controllers/listen/listen.controller';
import { ListenService } from './services/listen.service';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
      },
    }),
    ConfigModule.forRoot({ cache: true, isGlobal: true }),
    FirebaseModule,
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
  ],
  controllers: [AppController, VideoController, ListenController],
  providers: [VideoService, ListenService],
})
export class AppModule {}
