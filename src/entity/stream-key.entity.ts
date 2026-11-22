import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { StreamPlatform } from 'src/enums/stream-platform.enum';

@Entity()
@Unique(['userId', 'platform'])
export class StreamKey {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255 })
  userId!: string;

  @Column({ type: 'enum', enum: StreamPlatform })
  platform!: StreamPlatform;

  @Column({ length: 500 })
  streamKey!: string;

  /** Only required for platforms without a fixed, well-known ingest URL (Kick, Rumble). Twitch doesn't use this. */
  @Column({ length: 2083, nullable: true })
  streamUrl?: string;

  /**
   * Whether the next live also goes out on this platform. Switched from the
   * TV's Simulcast dialog, the TV live page and the phone's go-live screen,
   * so every device shows the same choice. Saving a key switches it on.
   */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
