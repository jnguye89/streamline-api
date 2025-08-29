
export interface LiveStreamResponse {
    live_stream: {
        id: string;
        name: string;
        state: string;
        broadcast_location: string;
        encoder: string;
        transcoder_type: string;
        direct_playback_urls?: Record<string, unknown>;
        source_connection_information?: {
            sdp_url: string;
            application_name: string;
            stream_name: string;
        };
    };
}

export enum StreamStatus {
    started,
    stopped
}