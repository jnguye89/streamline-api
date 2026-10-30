import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Report, ReportStatus } from 'src/entity/report.entity';
import { User } from 'src/entity/user.entity';
import { UserBlock } from 'src/entity/user-block.entity';

/** What a viewer has asked not to see: everything from users they blocked, and what they reported. */
export type HiddenContent = {
  blockedUserIds: Set<string>;
  reportedVideoIds: Set<number>;
  reportedChannelNames: Set<string>;
};

const NOTHING_HIDDEN: HiddenContent = {
  blockedUserIds: new Set(),
  reportedVideoIds: new Set(),
  reportedChannelNames: new Set(),
};

@Injectable()
export class ModerationRepository {
  constructor(
    @InjectRepository(Report) private readonly reportRepo: Repository<Report>,
    @InjectRepository(UserBlock)
    private readonly blockRepo: Repository<UserBlock>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  createReport(report: Partial<Report>): Promise<Report> {
    return this.reportRepo.save(this.reportRepo.create(report));
  }

  /** The reporter's own open report on the same thing, so reporting twice doesn't pile up. */
  findOpenReport(
    reporterId: string,
    target: { videoId?: number; channelName?: string },
  ): Promise<Report | null> {
    return this.reportRepo.findOne({
      where: {
        reporterId,
        status: 'open',
        ...(target.videoId !== undefined
          ? { videoId: target.videoId }
          : { channelName: target.channelName }),
      },
    });
  }

  findReport(id: number): Promise<Report | null> {
    return this.reportRepo.findOne({ where: { id } });
  }

  /** Oldest first, so whatever is closest to the 24-hour limit comes up first. */
  findReports(status: ReportStatus): Promise<Report[]> {
    return this.reportRepo.find({
      where: { status },
      order: { createdAt: 'ASC' },
      take: 200,
    });
  }

  async resolveReports(ids: number[], status: ReportStatus): Promise<void> {
    if (!ids.length) return;
    await this.reportRepo.update(
      { id: In(ids) },
      { status, resolvedAt: new Date() },
    );
  }

  /** Every open report about the same video or stream, so one decision closes them all. */
  findOpenReportsOnSameTarget(report: Report): Promise<Report[]> {
    return this.reportRepo.find({
      where: {
        status: 'open',
        ...(report.videoId !== null
          ? { videoId: report.videoId }
          : { channelName: report.channelName! }),
      },
    });
  }

  findOpenReportsAgainst(userId: string): Promise<Report[]> {
    return this.reportRepo.find({
      where: { reportedUserId: userId, status: 'open' },
    });
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    await this.blockRepo
      .createQueryBuilder()
      .insert()
      .into(UserBlock)
      .values({ blockerId, blockedId })
      .orIgnore()
      .execute();
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.blockRepo.delete({ blockerId, blockedId });
  }

  /** The users someone has blocked, with what's needed to list them, newest first. */
  async findBlockedUsers(
    blockerId: string,
  ): Promise<
    { auth0UserId: string; username: string; picture: string | null }[]
  > {
    const blocks = await this.blockRepo.find({
      where: { blockerId },
      order: { createdAt: 'DESC' },
    });
    if (!blocks.length) return [];
    const users = await this.userRepo.find({
      where: { auth0UserId: In(blocks.map((b) => b.blockedId)) },
    });
    const byId = new Map(users.map((u) => [u.auth0UserId, u]));
    return blocks
      .map((b) => byId.get(b.blockedId))
      .filter((u): u is User => !!u && !u.deletedAt)
      .map((u) => ({
        auth0UserId: u.auth0UserId,
        username: u.username,
        picture: u.picture,
      }));
  }

  async hiddenFor(viewerId: string | null | undefined): Promise<HiddenContent> {
    if (!viewerId) return NOTHING_HIDDEN;
    const [blocks, reports] = await Promise.all([
      this.blockRepo.find({ where: { blockerId: viewerId } }),
      this.reportRepo.find({ where: { reporterId: viewerId } }),
    ]);
    return {
      blockedUserIds: new Set(blocks.map((b) => b.blockedId)),
      reportedVideoIds: new Set(
        reports.flatMap((r) => (r.videoId !== null ? [r.videoId] : [])),
      ),
      reportedChannelNames: new Set(
        reports.flatMap((r) => (r.channelName !== null ? [r.channelName] : [])),
      ),
    };
  }
}
