import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { REPORT_REASONS, Report, ReportReason } from 'src/entity/report.entity';
import { AgoraStreamRepository } from 'src/repositories/agora-stream.repository';
import { ModerationRepository } from 'src/repositories/moderation.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { VideoRepository } from 'src/repositories/video.repository';
import { AccountDeletionService } from './account-deletion.service';
import { MultistreamService } from './multistream.service';
import { VideoService } from './video.service';

export type ReportInput = {
  videoId?: unknown;
  channelName?: unknown;
  reason?: unknown;
  details?: unknown;
};

/** What an admin decides about a report. */
export type ReportAction = 'dismiss' | 'remove' | 'ban';

const MAX_DETAILS = 1000;

/**
 * Reporting, blocking and acting on reports — what App Store guideline 1.2 asks of apps with
 * user-generated content. Reporters stop seeing what they reported straight away (see
 * ModerationRepository.hiddenFor); admins see open reports oldest first and decide on each
 * within 24 hours.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly moderationRepository: ModerationRepository,
    private readonly videoRepository: VideoRepository,
    private readonly agoraStreamRepository: AgoraStreamRepository,
    private readonly userRepository: UserRepository,
    private readonly videoService: VideoService,
    private readonly multistreamService: MultistreamService,
    private readonly accountDeletionService: AccountDeletionService,
  ) {}

  async report(reporterId: string, input: ReportInput): Promise<Report> {
    const reason = input.reason as ReportReason;
    if (!REPORT_REASONS.includes(reason)) {
      throw new BadRequestException(
        `reason must be one of: ${REPORT_REASONS.join(', ')}`,
      );
    }
    const details =
      typeof input.details === 'string' && input.details.trim()
        ? input.details.trim().slice(0, MAX_DETAILS)
        : null;

    const hasVideo = input.videoId !== undefined && input.videoId !== null;
    const hasChannel =
      typeof input.channelName === 'string' && !!input.channelName.trim();
    if (hasVideo === hasChannel) {
      throw new BadRequestException('Report either a videoId or a channelName');
    }

    let target: { videoId?: number; channelName?: string };
    let reportedUserId: string;
    if (hasVideo) {
      const videoId = Number(input.videoId);
      const [video] = Number.isInteger(videoId)
        ? await this.videoRepository.findByIds([videoId])
        : [];
      if (!video) throw new NotFoundException('Video not found');
      target = { videoId };
      reportedUserId = video.user;
    } else {
      const channelName = (input.channelName as string).trim();
      const stream =
        await this.agoraStreamRepository.findByChannelName(channelName);
      if (!stream) throw new NotFoundException('Stream not found');
      target = { channelName };
      reportedUserId = stream.user.auth0UserId;
    }

    const existing = await this.moderationRepository.findOpenReport(
      reporterId,
      target,
    );
    if (existing) return existing;

    const report = await this.moderationRepository.createReport({
      reporterId,
      reportedUserId,
      videoId: target.videoId ?? null,
      channelName: target.channelName ?? null,
      reason,
      details,
      status: 'open',
    });
    // Shows up in the server logs too, so a report can't go unnoticed if nobody checks the list.
    this.logger.warn(
      `New report #${report.id} (${reason}) on ${
        target.videoId !== undefined
          ? `video ${target.videoId}`
          : `stream ${target.channelName}`
      } by ${reportedUserId}. Act on it within 24 hours.`,
    );
    return report;
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new BadRequestException('You can’t block yourself');
    }
    const user = await this.userRepository.getUser(blockedId);
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    await this.moderationRepository.block(blockerId, blockedId);
  }

  unblock(blockerId: string, blockedId: string): Promise<void> {
    return this.moderationRepository.unblock(blockerId, blockedId);
  }

  findBlockedUsers(blockerId: string) {
    return this.moderationRepository.findBlockedUsers(blockerId);
  }

  findOpenReports(): Promise<Report[]> {
    return this.moderationRepository.findReports('open');
  }

  /**
   * Settles a report, and every other open report on the same video or stream with it.
   * - dismiss: the content stays.
   * - remove: the video is deleted, or the live stream ended.
   * - ban: the owner's account is deleted, with all their content, and every open report
   *   against them is closed.
   */
  async resolve(reportId: number, action: unknown): Promise<void> {
    if (action !== 'dismiss' && action !== 'remove' && action !== 'ban') {
      throw new BadRequestException('action must be dismiss, remove or ban');
    }
    const report = await this.moderationRepository.findReport(reportId);
    if (!report) throw new NotFoundException('Report not found');

    const sameTarget =
      await this.moderationRepository.findOpenReportsOnSameTarget(report);
    const ids = [report.id, ...sameTarget.map((r) => r.id)];

    if (action === 'dismiss') {
      await this.moderationRepository.resolveReports(ids, 'dismissed');
      return;
    }

    if (action === 'remove') {
      if (report.videoId !== null) {
        await this.videoService.deleteVideo(report.videoId);
      } else {
        await this.endStream(report.channelName!);
      }
      await this.moderationRepository.resolveReports(ids, 'removed');
      return;
    }

    if (report.channelName !== null) await this.endStream(report.channelName);
    await this.accountDeletionService.deleteAccount(report.reportedUserId);
    const againstThem = await this.moderationRepository.findOpenReportsAgainst(
      report.reportedUserId,
    );
    await this.moderationRepository.resolveReports(
      [...new Set([...ids, ...againstThem.map((r) => r.id)])],
      'banned',
    );
  }

  private async endStream(channelName: string): Promise<void> {
    const stream =
      await this.agoraStreamRepository.findByChannelName(channelName);
    if (!stream) return;
    if (stream.status === 'live' || stream.status === 'created') {
      stream.status = 'ended';
      await this.agoraStreamRepository.save(stream);
      await this.multistreamService.stopAll(channelName);
    }
  }
}
