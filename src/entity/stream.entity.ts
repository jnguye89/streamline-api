import { AutoMap } from "@automapper/classes";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Stream {
    @AutoMap()
    @PrimaryGeneratedColumn()
    id: number;

    @AutoMap()
    @Column({ length: 10, unique: true })
    wowzaId: string;

    @AutoMap()
    @Column({ length: 50 })
    broadcastLocation: string;

    @AutoMap()
    @Column({ length: 15 })
    applicationName: string;

    @AutoMap()
    @Column({ length: 500 })
    wssStreamUrl: string;

    @AutoMap()
    @Column({ length: 10 })
    streamName: string;

    @Index()
    @Column({ length: 16 })
    phase!: 'idle' | 'starting' | 'ready' | 'publishing' | 'ended' | 'error';

    /** raw last known wowza state (optional) */
    @Column({ nullable: true })
    lastWowzaState?: string;

    /** human-readable error if any */
    @Column({ nullable: true })
    errorMessage?: string;

    /** avoid duplicate starts; set true while polling */
    @Index()
    @Column({ default: false })
    isProvisioning!: boolean;

    @Column({ type: 'varchar', length: 255, nullable: true })
    provisonedUser: string | null;

    @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
    updatedAt!: Date;
}