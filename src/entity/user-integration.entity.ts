import { AutoMap } from '@automapper/classes';
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
  @AutoMap()
  @PrimaryGeneratedColumn()
  id: number;

  @AutoMap()
  @Column({ length: 250 })
  user: string;

  @AutoMap()
  @Column({ length: 250 })
  integrationUsername: string;

  @AutoMap()
  @Column({ length: 250 })

  @AutoMap()
  @Column()
  ha1: string;

  @AutoMap()
  @Column({
    type: 'enum',
    enum: IntegrationType,
  })
  integrationType: IntegrationType;

  /** Set automatically on INSERT */
  @AutoMap()
  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  /** Bumped automatically on UPDATE */
  @AutoMap()
  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;
}
