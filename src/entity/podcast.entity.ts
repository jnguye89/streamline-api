import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Podcast {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 300 })
    resourceId: string;

    @Column()
    uid: number;

    @Column({ length: 100, nullable: true })
    sid: string;

    @Column({ length: 100 })
    channelName: string;

    @Column({ nullable: true })
    status: string;

    @Column()
    auth0UserId: string;

    /** Set automatically on INSERT */
    @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
    createdAt: Date;

    /** Bumped automatically on UPDATE */
    @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
    updatedAt: Date;
}