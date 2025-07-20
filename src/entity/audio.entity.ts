import { AutoMap } from '@automapper/classes';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Audio {
  @AutoMap()
  @PrimaryGeneratedColumn()
  id: number;

  @AutoMap()
  @Column({ length: 255 })
  user: string;

  @AutoMap()
  @Column({ length: 100, nullable: true })
  name: string;

  @AutoMap()
  @Column({ length: 2083 })
  audioPath: string;

  @AutoMap()
  /** Set automatically on INSERT */
  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @AutoMap()
  /** Bumped automatically on UPDATE */
  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;
}
