import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VideoStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity()
export class Video {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255 })
  user!: string;

  @Column({ length: 2083 })
  videoPath!: string;

  @Column({ length: 2083, nullable: true })
  processedPath?: string;

  @Column({ type: 'enum', enum: VideoStatus, default: VideoStatus.PENDING })
  status!: VideoStatus;

  /** Set automatically on INSERT */
  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  /** Bumped automatically on UPDATE */
  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
