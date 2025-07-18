import { AutoMap } from '@automapper/classes';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Video {
  @AutoMap()
  @PrimaryGeneratedColumn()
  id: number;

  @AutoMap()
  @Column({ length: 255 })
  user: string;

  @AutoMap()
  @Column({ length: 2083 })
  videoPath: string;

  /** Set automatically on INSERT */
  @AutoMap()
  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  /** Bumped automatically on UPDATE */
  @AutoMap()
  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;
}
