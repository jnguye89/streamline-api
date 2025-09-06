import { AutoMap } from "@automapper/classes";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Thread {
    @AutoMap()
    @PrimaryGeneratedColumn()
    id: number;

    @AutoMap()
    @Column({ length: 1000 })
    threadItem: string;

    @AutoMap()
    @Column({ length: 255 })
    user: string;

    @AutoMap()
    /** Set automatically on INSERT */
    @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
    createdAt: Date;

    @AutoMap()
    /** Bumped automatically on UPDATE */
    @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
    updatedAt: Date;
}