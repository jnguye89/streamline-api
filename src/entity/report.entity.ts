import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const REPORT_REASONS = [
  'spam',
  'sexual',
  'violence',
  'harassment',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportStatus = 'open' | 'dismissed' | 'removed' | 'banned';

/**
 * Someone flagging a video or live stream as objectionable (App Store guideline 1.2). Open
 * reports need acting on within 24 hours; see ModerationService.
 */
@Entity()
@Index(['status', 'createdAt'])
export class Report {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ length: 128 })
  reporterId!: string;

  /** Whose content it is. */
  @Index()
  @Column({ length: 128 })
  reportedUserId!: string;

  /** Exactly one of videoId and channelName is set. */
  @Column({ type: 'int', nullable: true })
  videoId!: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  channelName!: string | null;

  @Column({ type: 'enum', enum: REPORT_REASONS })
  reason!: ReportReason;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  details!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: ReportStatus;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamp', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;
}
