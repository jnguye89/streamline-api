import { IntegrationType } from 'src/enums/integration-type.enum';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class User_Integration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 250 })
  user: string;

  @Column({ length: 250 })
  integrationUsername: string;

  @Column({ length: 250 })

  @Column()
  ha1: string;

  @Column({
    type: 'enum',
    enum: IntegrationType,
  })
  integrationType: IntegrationType;

  /** Set automatically on INSERT */
  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  /** Bumped automatically on UPDATE */
  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;
}
