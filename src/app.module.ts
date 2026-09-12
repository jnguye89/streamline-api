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
import { VideoProgressRepository } from './repositories/video-progress.repository';
import { VideoLikeRepository } from './repositories/video-like.repository';
import { StreamKeyRepository } from './repositories/stream-key.repository';
import { StreamKeyService } from './services/stream-key.service';
import { StreamKeyController } from './controllers/stream-key.controller';
import { Video } from './entity/video.entity';
import { VideoProgress } from './entity/video-progress.entity';
import { VideoLike } from './entity/video-like.entity';
import { StreamKey } from './entity/stream-key.entity';
import { Audio } from './entity/audio.entity';
import { IvsService } from './services/third-party/ivs.services';
import { AudioRepository } from './repositories/audio.repository';
import { User_Integration } from './entity/user-integration.entity';
import { UserIntegrationController } from './controllers/user-integration.controller';
import { UserIntegrationService } from './services/user-integration.service';
import { UserIntegrationRepository } from './repositories/user-integration.repository';
import { VoxAuthService } from './services/third-party/vox-auth.service';
import { VoximplantService } from './services/third-party/voximplant.service';
import { Stream } from './entity/stream.entity';
import StreamController from './controllers/stream/stream.controller';
import { StreamService } from './services/stream.service';
import { StreamRepository } from './repositories/stream.repository';
import { WowzaService } from './services/third-party/wowza.service';
import { StreamsEvents } from './services/third-party/streams.events';
import { ThreadController } from './controllers/thread.controller';
import { ThreadService } from './services/thread.service';
import { ThreadRepository } from './repositories/thread.repository';
import { Thread } from './entity/thread.entity';
import { User } from './entity/user.entity';
import { UserRepository } from './repositories/user.repository';
import { UserService } from './services/user.service';
import { Auth0Service } from './services/third-party/auth0.service';
import { DeviceAuthService } from './services/device-auth.service';
import { DeviceAuthController } from './controllers/device-auth/device-auth.controller';
import { ElevenLabsController } from './controllers/elevenlabs.controller';
import { ElevenLabsService } from './services/third-party/elevenlabs.service';
import { ErrorLog } from './entity/error-log.entity';
import { LogService } from './services/log.service';
import { CallController } from './controllers/call/call.controller';
import { AgoraTokenService } from './services/third-party/agora/agora-token.service';
import { UserController } from './controllers/user.controller';
import { AgoraRecordingService } from './services/third-party/agora/agora-recording.service';
import { Podcast } from './entity/podcast.entity';
import { PodcastRepository } from './repositories/podcast.repository';
import { EventsService } from './services/events/events.service';
import { EventsGateway } from './controllers/events/events.gateway';
import { AgoraStream } from './entity/agora-stream.entity';
import { AgoraStreamRepository } from './repositories/agora-stream.repository';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { VideoQueueService } from './services/video-queue.service';
import { VideoFeedRepository } from './repositories/video-feed.repository';
import { VideoEngagementSchedulerService } from './services/video-engagement-scheduler.service';
import { YoutubeChannel } from './entity/youtube-channel.entity';
import { YoutubeChannelRepository } from './repositories/youtube-channel.repository';
import { YoutubeChannelController } from './controllers/youtube-channel.controller';
import { YoutubeService } from './services/third-party/youtube.service';
import { YoutubeVideoCacheRepository } from './repositories/youtube-video-cache.repository';
import { YoutubeSyncSchedulerService } from './services/youtube-sync-scheduler.service';
import { RedisClientService } from './services/redis-client.service';
import { ChessGame } from './entity/chess-game.entity';
import { ChessGameRepository } from './repositories/chess-game.repository';
import { ChessService } from './services/chess/chess.service';
import { ChessTimeoutSchedulerService } from './services/chess/chess-timeout-scheduler.service';
import { ChessController } from './controllers/chess/chess.controller';
import { ChessGateway } from './controllers/chess/chess.gateway';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
      },
    }),
    BullModule.registerQueue({
      name: 'video-processing',
    }),
    ScheduleModule.forRoot(),
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
      // Without this, mysql2 falls back to the host OS's local timezone when
      // converting Date <-> TIMESTAMP/DATETIME, while MySQL's own TIMESTAMP
      // columns convert through the server's session time_zone (usually
      // 'SYSTEM'). On a machine whose local zone isn't UTC, those two
      // assumptions disagree and every auto-generated timestamp (createdAt,
      // updatedAt, turnStartedAt, ...) gets written off by the local UTC
      // offset - concretely, a game created "now" on a Pacific-time laptop
      // was coming back with a createdAt nearly 6 hours in the future
      // relative to the machine's own clock, which meant
      // ChessGameRepository.findStaleWaitingGames()'s `createdAt < cutoff`
      // check could never match it (a timestamp stamped into the future is
      // never "older than 15 minutes ago"), so the auto-abandon sweep would
      // never fire for it - forever, not just "not yet." Production wasn't
      // affected because both the app and DB there already run in UTC, so
      // the two assumptions happened to already agree. Pinning the
      // connection to UTC makes that agreement explicit instead of
      // accidental, so this can't depend on whatever timezone a given
      // machine (or its local MySQL install) happens to be set to.
      timezone: 'Z',
    }),
    TypeOrmModule.forFeature([
      Video,
      VideoProgress,
      VideoLike,
      StreamKey,
      Audio,
      User_Integration,
      Stream,
      AgoraStream,
      Thread,
      User,
      ErrorLog,
      Podcast,
      YoutubeChannel,
      ChessGame,
    ]),
  ],
  controllers: [
    AppController,
    VideoController,
    StreamController,
    ListenController,
    UserIntegrationController,
    StreamKeyController,
    ThreadController,
    CallController,
    UserController,
    DeviceAuthController,
    ElevenLabsController,
    YoutubeChannelController,
    ChessController,
  ],
  providers: [
    RedisClientService,
    {
      provide: 'REDIS_CLIENT',
      useExisting: RedisClientService,
    },
    VideoFeedRepository,
    VideoQueueService,
    VideoEngagementSchedulerService,
    VoximplantService,
    VoxAuthService,
    VideoService,
    StreamService,
    ListenService,
    JwtStrategy,
    S3Service,
    VideoRepository,
    VideoProgressRepository,
    VideoLikeRepository,
    StreamKeyRepository,
    StreamKeyService,
    StreamRepository,
    AgoraStreamRepository,
    IvsService,
    AudioRepository,
    PodcastRepository,
    WowzaService,
    UserIntegrationService,
    UserIntegrationRepository,
    StreamsEvents,
    ThreadService,
    ThreadRepository,
    UserRepository,
    UserService,
    Auth0Service,
    LogService,
    AgoraTokenService,
    AgoraRecordingService,
    EventsService,
    EventsGateway,
    DeviceAuthService,
    ElevenLabsService,
    YoutubeChannelRepository,
    YoutubeService,
    YoutubeVideoCacheRepository,
    YoutubeSyncSchedulerService,
    ChessGameRepository,
    ChessService,
    ChessTimeoutSchedulerService,
    ChessGateway,
  ],
  exports: [VideoQueueService],
})
export class AppModule {}
