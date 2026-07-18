import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity()
@Unique(['userId', 'videoId'])
export class VideoProgress {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255 })
  userId!: string;

  @Column()
  videoId!: number;

  @Column({ type: 'float' })
  timestamp!: number;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
