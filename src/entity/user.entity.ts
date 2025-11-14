import { Column, Entity, JoinColumn, OneToMany, OneToOne, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";
import { Thread } from "./thread.entity";
import { Stream } from "./stream.entity";

@Entity()
export class User {
    @PrimaryColumn({ name: "auth0_user_id", type: "varchar", length: 128 })
    auth0UserId: string;

    @Column({ name: "agora_user_id", type: "int" })
    agoraUserId: number;

    @Column({ name: "username", type: "varchar", length: 256 })
    username: string;

    @Column({ name: "last_synced_at", type: "timestamp", nullable: true })
    lastSyncedAt: Date;

    @OneToMany(() => Thread, (t) => t.user)
    threads!: Thread[];

    @OneToOne(() => Stream, (s) => s.user)
    stream!: Stream | null;
}