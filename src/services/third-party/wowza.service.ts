import { HttpService } from "@nestjs/axios";
import { HttpException, Injectable } from "@nestjs/common";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import { StreamDto } from "src/dto/stream.dto";
import { CreateLiveStreamDto } from "src/dto/wowza/create-live-stream.dto";
import { LiveStreamResponse } from "src/dto/wowza/live-stream-response.dto";
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

            return {
                wowzaId: data.live_stream.id,
                broadcastLocation: data.live_stream.broadcast_location,
                applicationName: data.live_stream.source_connection_information?.application_name,
                wssStreamUrl: data.live_stream.source_connection_information?.sdp_url,
                streamName: data.live_stream.source_connection_information?.stream_name
            } as StreamDto;


            // return await this.streamRepo.create(streamDto);
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

    // NB: set baseURL + Authorization header in AxiosModule.forRoot
    async startLiveStream(wowzaId: string) {
        await firstValueFrom(this.http.put(`${this.wowzaUrl}/live_streams/${wowzaId}/start`, null, {
            headers: { Authorization: `Bearer ${this.wowzaToken}` }
        }));
    }

    async getLiveStream(wowzaId: string): Promise<LiveStreamResponse> {
        const res = await firstValueFrom(this.http.get(`${this.wowzaUrl}/live_streams/${wowzaId}`, {
            headers: { Authorization: `Bearer ${this.wowzaToken}` }
        }));
        return res.data;
    }

    /** Returns true when stream can accept WebRTC publish */
    async isReadyState(ls: LiveStreamResponse): Promise<boolean> {
        const isActive = ls?.live_stream.state?.toLowerCase() == 'started'
        if (isActive) {
            const { data } = await firstValueFrom(
                this.http.get<StreamStatusDto>(`${this.wowzaUrl}/analytics/ingest/live_streams/${ls.live_stream.id}`, {
                    headers: { Authorization: `Bearer ${this.wowzaToken}` },
                },),
            );

            return data.live_stream.bytes_in_rate.value <= 0;
        }
        // Wowza Video typically: "state": "started" when ready for publish
        // (You can refine to check transcoder/encoder details if needed)
        return false;
    }

    async isStreaming(streamId: string): Promise<boolean> {
        const { data } = await firstValueFrom(
            this.http.get<StreamStatusDto>(`${this.wowzaUrl}/analytics/ingest/live_streams/${streamId}`, {
                headers: { Authorization: `Bearer ${this.wowzaToken}` },
            },),
        );

        return data.live_stream.bytes_in_rate.value > 0;
    }
}