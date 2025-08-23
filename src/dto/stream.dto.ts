import { AutoMap } from "@automapper/classes";

export class StreamDto {
    @AutoMap()
    id: number;
    @AutoMap()
    streamId: string;
    @AutoMap()
    broadcastLocation: string;
    @AutoMap()
    applicationName: string;
    @AutoMap()
    wssStreamUrl: string;
    @AutoMap()
    streamName: string;
}