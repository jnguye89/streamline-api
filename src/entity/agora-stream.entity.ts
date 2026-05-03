import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";

@Entity()
export class AgoraStream {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ length: 100 })
    channelName!: string;

    @ManyToOne(() => User, (u) => u.streams, {
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
        eager: true,
        nullable: false,
    })
    @JoinColumn({
        name: "user_id",                      // FK column on AgoraStream
        referencedColumnName: "auth0UserId",  // points to User.auth0UserId
    })
    user!: User;

    @Index()
    @Column({ length: 16 })
    status!: 'created' | 'live' | 'ended' | 'error';

    @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
    updatedAt!: Date;

    @Column({ type: 'timestamp', name: 'last_heartbeat_at', nullable: true })
    lastHeartbeatAt?: Date;
}