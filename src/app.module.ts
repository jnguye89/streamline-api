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
import { S3Service } from './services/third-party/s3.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoRepository } from './repositories/video.repository';
import { Video } from './entity/video.entity';
import { Audio } from './entity/audio.entity';
import { IvsService } from './services/third-party/ivs.services';
import { AudioRepository } from './repositories/audio.repository';
import { AutomapperModule } from '@automapper/nestjs';
import { classes } from '@automapper/classes';
import { AudioProfile } from './mappers/audio.mapper';
import { VideoProfile } from './mappers/video.mapper';
import { User_Integration } from './entity/user-integration.entity';
import { UserIntegrationController } from './controllers/user-integration.controller';
import { UserIntegrationService } from './services/user-integration.service';
import { UserIntegrationRepository } from './repositories/user-integration.repository';
import { UserIntegratinProfile } from './mappers/user-integration.mapper';
import { VoxAuthService } from './services/third-party/vox-auth.service';
import { VoximplantService } from './services/third-party/voximplant.service';
import { Stream } from './entity/stream.entity';
import { StreamProfile } from './mappers/stream.mapper';
import { StreamController } from './controllers/stream/stream.controller';
import { StreamService } from './services/stream.service';
import { StreamRepository } from './repositories/stream.repository';
import { WowzaService } from './services/third-party/wowza.service';

@Module({
  imports: [
    AutomapperModule.forRoot({
      strategyInitializer: classes(),
    }),
    // AutomapperModule.forFeature([VideoProfile]),
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
      database: process.env.STREAMLINE_DB_NAME,
      autoLoadEntities: true,
      synchronize: true, // turn off in prod
    }),
    TypeOrmModule.forFeature([Video, Audio, User_Integration, Stream]),
  ],
  controllers: [
    AppController,
    VideoController,
    StreamController,
    ListenController,
    UserIntegrationController,
  ],
  providers: [
    VoximplantService,
    VoxAuthService,
    VideoService,
    StreamService,
    ListenService,
    JwtStrategy,
    S3Service,
    VideoRepository,
    StreamRepository,
    IvsService,
    AudioRepository,
    AudioProfile,
    VideoProfile,
    StreamProfile,
    WowzaService,
    UserIntegrationService,
    UserIntegrationRepository,
    UserIntegratinProfile,
  ],
})
export class AppModule { }
