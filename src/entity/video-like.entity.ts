import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity()
@Unique(['userId', 'videoId'])
export class VideoLike {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255 })
  userId!: string;

  @Column()
  videoId!: number;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
