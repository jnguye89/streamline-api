import { AutoMap } from "@automapper/classes";
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Stream {
    @AutoMap()
    @PrimaryGeneratedColumn()
    id: number;

    @AutoMap()
    @Column({ length: 10, unique: true })
    streamId: string;

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
    @Column({length: 10})
    streamName: string;

    @AutoMap()
    @Column({ default: false })
    isActive: boolean;

    @AutoMap()
    @Column({ default: false})
    isLive: boolean;
}