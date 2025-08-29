import { AutoMap } from "@automapper/classes";

export class StreamDto {
    @AutoMap()
    id: number;
    @AutoMap()
    wowzaId: string;
    @AutoMap()
    broadcastLocation: string;
    @AutoMap()
    applicationName: string;
    @AutoMap()
    wssStreamUrl: string;
    @AutoMap()
    streamName: string;
    @AutoMap()
    phase: 'idle' | 'starting' | 'ready' | 'publishing' | 'ended' | 'error';
    @AutoMap()
    lastWowzaState?: string;
    @AutoMap()
    errorMessage?: string;
    @AutoMap()
    isProvisioning: boolean;
    @AutoMap()
    provisionedUser: string | null;
    @AutoMap()
    createdAt: Date;
    @AutoMap()
    updatedAt: Date;
}