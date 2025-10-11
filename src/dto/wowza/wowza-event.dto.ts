import { WowzaVideoDto } from "./video.dto";

export interface WowzaEventDto {
    event_type: string,
    event_id: string,
    object_id: string,
    event_time: string,
    payload: WowzaVideoDto
}