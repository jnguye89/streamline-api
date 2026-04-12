// streams/stream-phase.ts
export type StreamPhase =
    | 'idle'
    | 'starting'
    | 'ready'
    | 'publishing'
    | 'ended'
    | 'error';
