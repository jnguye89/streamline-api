import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { VideoController } from './controllers/video/video.controller';
import { ConfigModule } from '@nestjs/config';
import { VideoService } from './services/video.service';
import { HttpModule } from '@nestjs/axios';
import { ListenController } from './controllers/listen/listen.controller';
import { ListenService } from './services/listen.service';
import { MulterModule } from '@nestjs/platform-express';
import { multerConfig } from './multer.config';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './auth/jwt.strategy';
import { S3Service } from './services/s3.service';
import { StreamGateway } from './services/stream.gateway';

@Module({
  imports: [
    PassportModule,
    MulterModule.register(multerConfig),
    ConfigModule.forRoot({ cache: true, isGlobal: true }),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
  ],
  controllers: [AppController, VideoController, ListenController],
  providers: [
    VideoService,
    ListenService,
    JwtStrategy,
    S3Service,
    StreamGateway,
  ],
})
export class AppModule {}
