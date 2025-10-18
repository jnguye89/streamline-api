import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class ErrorLog {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 5000 })
    message: string;

    @Column({ type: 'varchar', length: 250, nullable: true })
    errorSource: string | null;

    @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
    updatedAt!: Date;
}