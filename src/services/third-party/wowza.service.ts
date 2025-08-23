import { HttpService } from "@nestjs/axios";
import { HttpException, Injectable } from "@nestjs/common";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import { StreamDto } from "src/dto/stream.dto";
import { CreateLiveStreamDto } from "src/dto/wowza/create-live-stream.dto";
import { LiveStreamResponse, StreamStatus } from "src/dto/wowza/live-stream-response.dto";
import { StreamStartResponse } from "src/dto/wowza/stream-start-response.dto";
import { StreamStatusResponeDto } from "src/dto/wowza/stream-status-response.dto";
import { StreamStatusDto } from "src/dto/wowza/stream-status.dto";
import { StreamRepository } from "src/repositories/stream.repository";

@Injectable()
export class WowzaService {
    private wowzaUrl = process.env.WOWZA_API_BASE;
    private wowzaToken = process.env.WOWZA_JWT;

    constructor(private http: HttpService, private streamRepo: StreamRepository) { }

    public async createStream(): Promise<StreamDto> {
        const payload: { live_stream: CreateLiveStreamDto } = {
            live_stream: new CreateLiveStreamDto()
        }
        try {
            const { data } = await firstValueFrom(
                this.http.post<LiveStreamResponse>(`${this.wowzaUrl}/live_streams`, payload, {
                    headers: { Authorization: `Bearer ${this.wowzaToken}` },
                },),
            );

            var streamDto = {
                streamId: data.live_stream.id,
                broadcastLocation: data.live_stream.broadcast_location,
                applicationName: data.live_stream.source_connection_information?.application_name,
                wssStreamUrl: data.live_stream.source_connection_information?.sdp_url,
                streamName: data.live_stream.source_connection_information?.stream_name
            } as StreamDto;

            return await this.streamRepo.create(streamDto);
        } catch (err) {
            const e = err as AxiosError<any>;
            // Wowza returns 401 (auth) and 422 (validation) on create
            const status = e.response?.status ?? 500;
            const message =
                e.response?.data?.error?.message ??
                e.response?.data ??
                e.message ??
                'Wowza create live stream failed';
            throw new HttpException(message, status);
        }
    }

    public async startStream(streamId: string): Promise<boolean> {
        try {
            const { data } = await firstValueFrom(
                this.http.put<StreamStartResponse>(`${this.wowzaUrl}/live_stream/${streamId}/start`)
            )
            return data.live_stream.state.toLowerCase() == 'starting'
        }
        catch (err) {
            const e = err as AxiosError<any>;
            // Wowza returns 401 (auth) and 422 (validation) on create
            const status = e.response?.status ?? 500;
            const message =
                e.response?.data?.error?.message ??
                e.response?.data ??
                e.message ??
                'Wowza start live stream failed';
            throw new HttpException(message, status);
        }
    }

    public async getStreamStatus(streamId: string): Promise<StreamStatusResponeDto> {
        try {
            const state = await firstValueFrom(
                this.http.get<LiveStreamResponse>(`${this.wowzaUrl}/live_streams/${streamId}/state`, {
                    headers: { Authorization: `Bearer ${this.wowzaToken}` },
                }),
            )
            let isActive = state.data.live_stream.state.toLowerCase() == 'started';
            let isLive = false;
            if (isActive) {
                const { data } = await firstValueFrom(
                    this.http.get<StreamStatusDto>(`${this.wowzaUrl}/analytics/ingest/live_streams/${streamId}`, {
                        headers: { Authorization: `Bearer ${this.wowzaToken}` },
                    },),
                );
                console.log(data);
                isLive = data.live_stream.bytes_in_rate.value > 0;
            }
            this.streamRepo.updateStreamStatus(streamId, isActive, isLive);
            return {
                isActive,
                isLive
            }
        } catch (err) {
            const e = err as AxiosError<any>;
            // Wowza returns 401 (auth) and 422 (validation) on create
            const status = e.response?.status ?? 500;
            const message =
                e.response?.data?.error?.message ??
                e.response?.data ??
                e.message ??
                'Wowza get stream status failed';
            throw new HttpException(message, status);
        }
    }
}