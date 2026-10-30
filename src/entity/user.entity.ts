import { Column, Entity, OneToMany, OneToOne, PrimaryColumn } from "typeorm";
import { Thread } from "./thread.entity";
import { Stream } from "./stream.entity";
import { AgoraStream } from "./agora-stream.entity";

@Entity()
export class User {
    @PrimaryColumn({ name: "auth0_user_id", type: "varchar", length: 128 })
    auth0UserId!: string;

    @Column({ name: "agora_user_id", type: "int" })
    agoraUserId!: number;

    @Column({ name: "username", type: "varchar", length: 256 })
    username!: string;

    /** Profile picture URL, mirrored from Auth0 so other users can be shown with it. */
    @Column({ name: "picture", type: "varchar", length: 1024, nullable: true })
    picture!: string | null;

    @Column({ name: "last_synced_at", type: "timestamp", nullable: true })
    lastSyncedAt!: Date;

    /**
     * When the account was deleted. The row stays, renamed "Deleted user" with no picture,
     * because other people's chess games still point at it; everything else of theirs is gone.
     */
    @Column({ name: "deleted_at", type: "timestamp", nullable: true })
    deletedAt!: Date | null;

    /** When they agreed to the terms of use, which the apps ask for before someone first posts. */
    @Column({ name: "terms_accepted_at", type: "timestamp", nullable: true })
    termsAcceptedAt!: Date | null;

    @OneToMany(() => Thread, (t) => t.user)
    threads!: Thread[];

    @OneToOne(() => Stream, (s) => s.user)
    stream!: Stream | null;

    @OneToMany(() => AgoraStream, (s) => s.user)
    streams!: AgoraStream[];
}