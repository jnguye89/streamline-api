export class StreamStatusDto {
    live_stream: {
        bytes_in_rate: {
            value: number
        },
        connected: {
            value: string
        }
    }
}