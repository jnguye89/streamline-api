import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Video {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  user: string;

  @Column({ length: 2083 })
  videoPath: string;

  /** Set automatically on INSERT */
  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  /** Bumped automatically on UPDATE */
  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;
}
