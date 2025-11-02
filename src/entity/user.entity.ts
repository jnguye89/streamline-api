import { AutoMap } from "@automapper/classes";
import { Column, Entity, JoinColumn, OneToMany, OneToOne, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";
import { Thread } from "./thread.entity";
import { Stream } from "./stream.entity";

@Entity()
export class User {
    @AutoMap()
    @PrimaryColumn({ name: "auth0_user_id", type: "varchar", length: 128 })
    auth0UserId: string;

    @AutoMap()
    @Column({ name: "agora_user_id", type: "int" })
    agoraUserId: number;

    @AutoMap()
    @Column({ name: "username", type: "varchar", length: 256 })
    username: string;

    @AutoMap()
    @Column({ name: "last_synced_at", type: "timestamp", nullable: true })
    lastSyncedAt: Date;

    @OneToMany(() => Thread, (t) => t.user)
    threads!: Thread[];

    @OneToOne(() => Stream, (s) => s.user)
    @AutoMap()
    stream!: Stream | null;
}