import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { VideoController } from './controllers/video/video.controller';
import { ConfigModule } from '@nestjs/config';
import { FirebaseModule } from './modules/firebase.module';
import { HttpModule } from '@nestjs/axios';
import { ListenController } from './controllers/listen/listen.controller';
import { ListenService } from './services/listen.service';
import { MulterModule } from '@nestjs/platform-express';
import { multerConfig } from './multer.config';
import { AuthModule } from './auth/auth.module';
import { S3Service } from './services/s3.service';

@Module({
  imports: [
    MulterModule.register(multerConfig),
    ConfigModule.forRoot({ cache: true, isGlobal: true }),
    FirebaseModule,
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
    AuthModule,
  ],
  controllers: [AppController, VideoController, ListenController],
  providers: [ListenService, S3Service],
})
export class AppModule {}
