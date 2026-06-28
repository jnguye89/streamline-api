import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { VideoProcessingProcessor } from './video-processing.worker';
import { VideoRepository } from 'src/repositories/video.repository';
import { Video } from 'src/entity/video.entity';
import { ElevenLabsService } from 'src/services/third-party/elevenlabs.service';

@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.RDS_HOSTNAME,
      port: parseInt(process.env.RDS_PORT ?? '3306', 10),
      username: process.env.RDS_USERNAME,
      password: process.env.RDS_PASSWORD,
      database: process.env.STREAMLINE_DB_NAME,
      autoLoadEntities: true,
      synchronize: false,
    }),
    TypeOrmModule.forFeature([Video]),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
      },
    }),
    BullModule.registerQueue({
      name: 'video-processing',
    }),
  ],
  providers: [
    VideoProcessingProcessor,
    VideoRepository,
    ElevenLabsService,
  ],
})
export class WorkerModule {}