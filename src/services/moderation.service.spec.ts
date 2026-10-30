import { BadRequestException, NotFoundException } from '@nestjs/common';

import { Report } from 'src/entity/report.entity';
import { ModerationService } from './moderation.service';

const reporter = 'auth0|reporter';
const owner = 'auth0|owner';

function setUp(options: { existingReport?: Partial<Report> } = {}) {
  const created: Partial<Report>[] = [];
  const resolved: { ids: number[]; status: string }[] = [];
  const moderationRepository = {
    findOpenReport: jest.fn(() =>
      Promise.resolve(options.existingReport ?? null),
    ),
    createReport: jest.fn((r: Partial<Report>) => {
      created.push(r);
      return Promise.resolve({ id: 1, ...r });
    }),
    findReport: jest.fn((id: number) =>
      Promise.resolve(
        id === 1
          ? { id: 1, videoId: 7, channelName: null, reportedUserId: owner }
          : id === 2
            ? {
                id: 2,
                videoId: null,
                channelName: 'host-abc',
                reportedUserId: owner,
              }
            : null,
      ),
    ),
    findOpenReportsOnSameTarget: jest.fn(() => Promise.resolve([{ id: 5 }])),
    findOpenReportsAgainst: jest.fn(() =>
      Promise.resolve([{ id: 5 }, { id: 9 }]),
    ),
    resolveReports: jest.fn((ids: number[], status: string) => {
      resolved.push({ ids, status });
      return Promise.resolve();
    }),
    block: jest.fn(() => Promise.resolve()),
  };
  const videoRepository = {
    findByIds: jest.fn((ids: number[]) =>
      Promise.resolve(ids[0] === 7 ? [{ id: 7, user: owner }] : []),
    ),
  };
  const stream = {
    channelName: 'host-abc',
    status: 'live',
    user: { auth0UserId: owner },
  };
  const agoraStreamRepository = {
    findByChannelName: jest.fn((name: string) =>
      Promise.resolve(name === 'host-abc' ? stream : null),
    ),
    save: jest.fn(() => Promise.resolve()),
  };
  const userRepository = {
    getUser: jest.fn((id: string) =>
      Promise.resolve(
        id === owner ? { auth0UserId: owner, deletedAt: null } : null,
      ),
    ),
  };
  const videoService = { deleteVideo: jest.fn(() => Promise.resolve()) };
  const multistreamService = { stopAll: jest.fn(() => Promise.resolve()) };
  const accountDeletionService = {
    deleteAccount: jest.fn(() => Promise.resolve()),
  };

  const service = new ModerationService(
    moderationRepository as never,
    videoRepository as never,
    agoraStreamRepository as never,
    userRepository as never,
    videoService as never,
    multistreamService as never,
    accountDeletionService as never,
  );
  return {
    service,
    created,
    resolved,
    stream,
    moderationRepository,
    videoService,
    multistreamService,
    accountDeletionService,
  };
}

describe('ModerationService', () => {
  describe('report', () => {
    it('records a report against the video’s owner', async () => {
      const { service, created } = setUp();

      await service.report(reporter, {
        videoId: 7,
        reason: 'spam',
        details: '  buy now  ',
      });

      expect(created).toEqual([
        expect.objectContaining({
          reporterId: reporter,
          reportedUserId: owner,
          videoId: 7,
          channelName: null,
          reason: 'spam',
          details: 'buy now',
          status: 'open',
        }),
      ]);
    });

    it('records a report against a live stream’s host', async () => {
      const { service, created } = setUp();

      await service.report(reporter, {
        channelName: 'host-abc',
        reason: 'violence',
      });

      expect(created[0]).toEqual(
        expect.objectContaining({
          channelName: 'host-abc',
          videoId: null,
          reportedUserId: owner,
        }),
      );
    });

    it('returns the existing open report instead of filing a second one', async () => {
      const { service, created } = setUp({ existingReport: { id: 3 } });

      const report = await service.report(reporter, {
        videoId: 7,
        reason: 'spam',
      });

      expect(report.id).toBe(3);
      expect(created).toHaveLength(0);
    });

    it('rejects unknown reasons, missing or double targets, and missing content', async () => {
      const { service } = setUp();

      await expect(
        service.report(reporter, { videoId: 7, reason: 'boring' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.report(reporter, { reason: 'spam' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.report(reporter, {
          videoId: 7,
          channelName: 'host-abc',
          reason: 'spam',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.report(reporter, { videoId: 404, reason: 'spam' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('block', () => {
    it('blocks an existing user', async () => {
      const { service, moderationRepository } = setUp();

      await service.block(reporter, owner);

      expect(moderationRepository.block).toHaveBeenCalledWith(reporter, owner);
    });

    it('refuses to block yourself or someone who doesn’t exist', async () => {
      const { service } = setUp();

      await expect(service.block(owner, owner)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        service.block(reporter, 'auth0|nobody'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resolve', () => {
    it('dismisses every open report on the same video, and leaves it up', async () => {
      const { service, resolved, videoService } = setUp();

      await service.resolve(1, 'dismiss');

      expect(resolved).toEqual([{ ids: [1, 5], status: 'dismissed' }]);
      expect(videoService.deleteVideo).not.toHaveBeenCalled();
    });

    it('removes a reported video', async () => {
      const { service, resolved, videoService } = setUp();

      await service.resolve(1, 'remove');

      expect(videoService.deleteVideo).toHaveBeenCalledWith(7);
      expect(resolved).toEqual([{ ids: [1, 5], status: 'removed' }]);
    });

    it('ends a reported live stream', async () => {
      const { service, stream, multistreamService } = setUp();

      await service.resolve(2, 'remove');

      expect(stream.status).toBe('ended');
      expect(multistreamService.stopAll).toHaveBeenCalledWith('host-abc');
    });

    it('bans by deleting the owner’s account and closing every report against them', async () => {
      const { service, resolved, accountDeletionService } = setUp();

      await service.resolve(1, 'ban');

      expect(accountDeletionService.deleteAccount).toHaveBeenCalledWith(owner);
      expect(resolved).toEqual([{ ids: [1, 5, 9], status: 'banned' }]);
    });

    it('rejects unknown actions and reports', async () => {
      const { service } = setUp();

      await expect(service.resolve(1, 'nuke')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.resolve(404, 'dismiss')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
