import { AutoMap } from "@automapper/classes";
import { Column, CreateDateColumn, Entity, Index, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";

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

    @OneToOne(() => User, (u) => u.stream, {
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
        eager: true
    })
    @JoinColumn({
        name: "user_id",                       // FK column on Stream
        referencedColumnName: "auth0UserId",   // points to User.auth0UserId
    })
    @AutoMap()
    user!: User;

    @Index()
    @Column({ length: 16 })
    phase!: 'idle' | 'starting' | 'ready' | 'publishing' | 'ended' | 'error';

    @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
    updatedAt!: Date;
}