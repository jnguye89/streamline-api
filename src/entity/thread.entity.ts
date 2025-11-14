import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";

@Entity()
export class Thread {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 1000 })
    threadText: string;

    @Column({ name: "auth0_user_id", type: "varchar", length: 128 })
    auth0UserId!: string;

    // --- Relation to User (Many threads -> one user) ---
    @ManyToOne(() => User, (u) => u.threads, {
        onDelete: "RESTRICT", // or "SET NULL" if you make auth0UserId nullable
        onUpdate: "CASCADE",
    })
    @JoinColumn({
        name: "auth0_user_id",            // FK column in threads
        referencedColumnName: "auth0UserId", // PK column in users
    })
    user!: User;

    /** Set automatically on INSERT */
    @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
    createdAt: Date;

    /** Bumped automatically on UPDATE */
    @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
    updatedAt: Date;
}