import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StreamPlatform } from 'src/enums/stream-platform.enum';

export type MultistreamStatus = 'starting' | 'active' | 'stopped' | 'error';

/**
 * One restream of an Agora channel out to a third-party platform (Twitch,
 * ...), backed by an Agora Media Push converter. The RTMP URL is never
 * stored here because it embeds the user's stream key.
 */
@Entity()
@Index(['channelName', 'status'])
export class Multistream {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 100 })
  channelName!: string;

  @Column({ length: 255 })
  userId!: string;

  @Column({ type: 'enum', enum: StreamPlatform })
  platform!: StreamPlatform;

  /** Agora Media Push converter id; null until Agora accepts the converter. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  converterId!: string | null;

  /** Media Push region the converter was created in - deletes must target the same one. */
  @Column({ length: 8 })
  region!: string;

  @Column({ length: 16 })
  status!: MultistreamStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
