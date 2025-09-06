import { AutoMap } from "@automapper/classes";

export class ThreadDto {
    @AutoMap()
    id?: number;
    @AutoMap()
    threadItem: string;
    @AutoMap()
    user: string;
    @AutoMap()
    createdAt: Date;
    @AutoMap()
    updatedAt: Date;
}