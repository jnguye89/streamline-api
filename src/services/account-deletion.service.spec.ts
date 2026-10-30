import { AgoraStream } from 'src/entity/agora-stream.entity';
import { Audio } from 'src/entity/audio.entity';
import { Stream } from 'src/entity/stream.entity';
import { User } from 'src/entity/user.entity';
import { Video } from 'src/entity/video.entity';
import { VideoLike } from 'src/entity/video-like.entity';
import { YoutubeChannel } from 'src/entity/youtube-channel.entity';
import {
  AccountDeletionService,
  DELETED_USERNAME,
} from './account-deletion.service';

const userId = 'auth0|deleteme';

/** A stand-in for TypeORM's EntityManager that records what was deleted and updated. */
function fakeManager(data: {
  videos?: Partial<Video>[];
  audio?: Partial<Audio>[];
  user?: Partial<User> | null;
}) {
  const deleted: { entity: unknown; criteria: unknown }[] = [];
  const updated: { entity: unknown; values: unknown }[] = [];
  const manager = {
    find: jest.fn((entity: unknown) =>
      Promise.resolve(
        entity === Video
          ? (data.videos ?? [])
          : entity === Audio
            ? (data.audio ?? [])
            : [],
      ),
    ),
    findOne: jest.fn(() => Promise.resolve(data.user ?? null)),
    delete: jest.fn((entity: unknown, criteria: unknown) => {
      deleted.push({ entity, criteria });
      return Promise.resolve({ affected: entity === YoutubeChannel ? 0 : 1 });
    }),
    update: jest.fn((entity: unknown, _where: unknown, values: unknown) => {
      updated.push({ entity, values });
      return Promise.resolve({});
    }),
    createQueryBuilder: jest.fn(() => {
      let entity: unknown;
      const qb = {
        delete: () => qb,
        from: (e: unknown) => {
          entity = e;
          return qb;
        },
        where: () => qb,
        execute: () => {
          deleted.push({ entity, criteria: 'user_id' });
          return Promise.resolve({});
        },
      };
      return qb;
    }),
  };
  return { manager, deleted, updated };
}

function setUp(options: {
  manager: ReturnType<typeof fakeManager>['manager'];
  liveStreams?: Partial<AgoraStream>[];
  auth0Fails?: boolean;
  s3Fails?: boolean;
}) {
  const calls: string[] = [];
  const dataSource = {
    getRepository: jest.fn(() => ({
      find: jest.fn(() => Promise.resolve(options.liveStreams ?? [])),
    })),
    transaction: jest.fn((work: (m: unknown) => Promise<unknown>) => {
      calls.push('transaction');
      return work(options.manager);
    }),
  };
  const auth0Service = {
    deleteUser: jest.fn(() => {
      calls.push('auth0');
      return options.auth0Fails
        ? Promise.reject(new Error('auth0 down'))
        : Promise.resolve();
    }),
  };
  const s3Service = {
    // Treat this bucket's URLs as keys under it; anything else isn't ours.
    keyFor: (p?: string | null) =>
      !p
        ? null
        : p.startsWith('https://bucket/')
          ? p.slice('https://bucket/'.length)
          : p.startsWith('http')
            ? null
            : p,
    deleteObjects: jest.fn(() =>
      options.s3Fails
        ? Promise.reject(new Error('s3 down'))
        : Promise.resolve(),
    ),
  };
  const agoraStreamRepository = {
    save: jest.fn((s: unknown) => {
      calls.push('end stream');
      return Promise.resolve(s);
    }),
  };
  const multistreamService = { stopAll: jest.fn(() => Promise.resolve()) };
  const agoraRecordingService = {
    stopRecording: jest.fn(() => Promise.resolve('file.mp4')),
  };
  const videoFeedRepository = {
    removeVideo: jest.fn(() => Promise.resolve()),
    forgetUser: jest.fn(() => Promise.resolve()),
  };
  const youtubeSyncSchedulerService = {
    refreshCache: jest.fn(() => Promise.resolve()),
  };

  const service = new AccountDeletionService(
    dataSource as never,
    auth0Service as never,
    s3Service as never,
    agoraStreamRepository as never,
    multistreamService as never,
    agoraRecordingService as never,
    videoFeedRepository as never,
    youtubeSyncSchedulerService as never,
  );
  return {
    service,
    calls,
    dataSource,
    s3Service,
    multistreamService,
    agoraRecordingService,
    videoFeedRepository,
  };
}

// Background cleanup runs after deleteAccount resolves; let it finish.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('AccountDeletionService', () => {
  it('ends live streams, then deletes the Auth0 account, then the data', async () => {
    const { manager } = fakeManager({});
    const { service, calls, multistreamService, agoraRecordingService } = setUp(
      {
        manager,
        liveStreams: [{ channelName: 'host-abc', status: 'live' }],
      },
    );

    await service.deleteAccount(userId);

    expect(calls).toEqual(['end stream', 'auth0', 'transaction']);
    expect(multistreamService.stopAll).toHaveBeenCalledWith('host-abc');
    expect(agoraRecordingService.stopRecording).toHaveBeenCalledWith(
      'host-abc',
    );
  });

  it('changes nothing in the database if Auth0 refuses', async () => {
    const { manager } = fakeManager({});
    const { service, dataSource } = setUp({ manager, auth0Fails: true });

    await expect(service.deleteAccount(userId)).rejects.toThrow('auth0 down');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('deletes their videos with everyone’s likes on them, and their own likes', async () => {
    const { manager, deleted } = fakeManager({
      videos: [
        {
          id: 7,
          videoPath: 'videos/original/a.mp4',
          processedPath: 'videos/processed/a.mp4',
        },
        { id: 9, videoPath: 'recordings/b.mp4' },
      ],
    });
    const { service, videoFeedRepository } = setUp({ manager });

    await service.deleteAccount(userId);
    await flush();

    const deletes = (entity: unknown) =>
      deleted.filter((d) => d.entity === entity).map((d) => d.criteria);
    expect(deletes(Video)).toHaveLength(1);
    expect(deletes(VideoLike)).toHaveLength(2); // likes on their videos, and likes they gave
    expect(
      deleted.filter((d) => d.entity === AgoraStream || d.entity === Stream),
    ).toHaveLength(2);
    expect(videoFeedRepository.removeVideo).toHaveBeenCalledWith(7);
    expect(videoFeedRepository.removeVideo).toHaveBeenCalledWith(9);
    expect(videoFeedRepository.forgetUser).toHaveBeenCalledWith(userId);
  });

  it('anonymizes the user row and removes only files in this bucket', async () => {
    const { manager, updated } = fakeManager({
      videos: [{ id: 7, videoPath: 'videos/original/a.mp4' }],
      audio: [{ audioPath: 'https://bucket/audio/c.mp3' }],
      user: {
        auth0UserId: userId,
        picture: 'https://s.gravatar.com/avatar/x.png',
      },
    });
    const { service, s3Service } = setUp({ manager });

    await service.deleteAccount(userId);
    await flush();

    expect(updated).toHaveLength(1);
    expect(updated[0].entity).toBe(User);
    expect(updated[0].values).toMatchObject({
      username: DELETED_USERNAME,
      picture: null,
    });
    expect(s3Service.deleteObjects).toHaveBeenCalledWith([
      'videos/original/a.mp4',
      'audio/c.mp3',
    ]);
  });

  it('still succeeds when the S3 cleanup fails afterwards', async () => {
    const { manager } = fakeManager({
      videos: [{ id: 7, videoPath: 'v.mp4' }],
    });
    const { service } = setUp({ manager, s3Fails: true });

    await expect(service.deleteAccount(userId)).resolves.toBeUndefined();
    await flush();
  });
});
