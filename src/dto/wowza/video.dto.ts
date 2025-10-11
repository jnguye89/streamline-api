export interface WowzaVideoDto {
    video: {
        id: string,
        name: string;
        description: string;
        encodings:
        {
            height: number;
            video_file_url: string;
            video_container: string;
        }[],
    }
}