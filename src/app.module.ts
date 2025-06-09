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
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoRepository } from './repositories/video.repository';
import { Video } from './entity/video.entity';

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
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.RDS_HOSTNAME,
      port: parseInt(process.env.RDS_PORT ?? '3306', 10),
      username: process.env.RDS_USERNAME,
      password: process.env.RDS_PASSWORD,
      database: process.env.RDS_DB_NAME,
      autoLoadEntities: true,
      synchronize: true, // turn off in prod
    }),
    TypeOrmModule.forFeature([Video]),
  ],
  controllers: [AppController, VideoController, ListenController],
  providers: [
    VideoService,
    ListenService,
    JwtStrategy,
    S3Service,
    VideoRepository,
  ],
})
export class AppModule {}
