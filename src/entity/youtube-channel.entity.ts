import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity()
@Unique(['userId', 'channelId'])
export class YoutubeChannel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255 })
  userId!: string;

  @Column({ length: 255 })
  channelId!: string;

  @Column({ length: 255, nullable: true })
  name?: string;

  /** e.g. "@mkbhd" - fetched from YouTube at creation time for display. */
  @Column({ length: 255, nullable: true })
  handle?: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
