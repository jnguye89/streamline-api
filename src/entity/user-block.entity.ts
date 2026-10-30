import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/** One user hiding another's videos and streams from themselves (App Store guideline 1.2). */
@Entity()
@Unique(['blockerId', 'blockedId'])
export class UserBlock {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 128 })
  blockerId!: string;

  @Index()
  @Column({ length: 128 })
  blockedId!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
