export class StreamDto {
    id: number;
    wowzaId: string;
    broadcastLocation: string;
    applicationName: string;
    wssStreamUrl: string;
    streamName: string;
    phase: 'idle' | 'starting' | 'ready' | 'publishing' | 'ended' | 'error';
    lastWowzaState?: string;
    errorMessage?: string;
    createdAt: Date;
    updatedAt: Date;
}