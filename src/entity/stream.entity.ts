import { Column, CreateDateColumn, Entity, Index, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";

@Entity()
export class Stream {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 10, unique: true })
    wowzaId: string;

    @Column({ length: 50 })
    broadcastLocation: string;

    @Column({ length: 15 })
    applicationName: string;

    @Column({ length: 500 })
    wssStreamUrl: string;

    @Column({ length: 10 })
    streamName: string;

    @OneToOne(() => User, (u) => u.stream, {
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
        eager: true
    })
    @JoinColumn({
        name: "user_id",                       // FK column on Stream
        referencedColumnName: "auth0UserId",   // points to User.auth0UserId
    })
    user!: User;

    @Index()
    @Column({ length: 16 })
    phase!: 'idle' | 'starting' | 'ready' | 'publishing' | 'ended' | 'error';

    @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
    updatedAt!: Date;
}