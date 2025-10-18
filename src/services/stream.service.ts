import { Injectable, NotFoundException } from "@nestjs/common";
import { StreamDto } from "src/dto/stream.dto";
import { Stream } from "src/entity/stream.entity";
import { StreamRepository } from "src/repositories/stream.repository";
import { Repository } from "typeorm";
import { WowzaService } from "./third-party/wowza.service";
import { StreamsEvents } from "./third-party/streams.events";
import { InjectRepository } from "@nestjs/typeorm";
import { Mapper } from "@automapper/core";
import { InjectMapper } from "@automapper/nestjs";
import { Cron } from "@nestjs/schedule";
import { LogService } from "./log.service";

@Injectable()
export class StreamService {
    constructor(
        @InjectMapper() private readonly mapper: Mapper,
        private streamRepo: StreamRepository,
        @InjectRepository(Stream) private repo: Repository<Stream>,
        private wowza: WowzaService, private events: StreamsEvents,
        private logService: LogService
    ) { }

    async findAll(): Promise<StreamDto[]> {
        return await this.streamRepo.findAll();
    }

    async findStreams(isActive: boolean, isLive: boolean, count?: number): Promise<StreamDto[]> {
        return await this.streamRepo.findStream(isActive, isLive, count);
    }

    /** Return an existing ready/starting stream OR start one and begin polling */
    async ensureReady(broadcastLocation: string, user: string): Promise<Stream> {
        let stream = await this.repo.findOne({
            where: {
                user: { auth0UserId: user }
            }
        });

        this.logService.insertLog(`get stream result: ${stream}.`, `streamservice.ensureready`);

        if (!stream) {
            this.logService.insertLog(`no stream found, creating in wowza`, `streamservice.ensureready`);
            let streamDto = await this.wowza.createStream(user, broadcastLocation);
            this.logService.insertLog(`stream response from wowza: ${JSON.stringify(streamDto)}`, `streamservice.ensureready`);
            try {
                stream = await this.repo.save({
                    wowzaId: streamDto.live_stream.id,
                    broadcastLocation: streamDto.live_stream.broadcast_location,
                    user: { auth0UserId: user },
                    phase: 'idle',
                    wssStreamUrl: streamDto.live_stream.source_connection_information?.sdp_url,
                    applicationName: streamDto.live_stream.source_connection_information?.application_name,
                    streamName: streamDto.live_stream.source_connection_information?.stream_name
                });
            }
            catch (ex) {
                this.logService.insertLog(ex, `streamservice.ensureready`);
                throw new Error(ex);
            }
            this.logService.insertLog(`stream saved to db: ${stream}`, `streamservice.ensureready`);
        }

        this.logService.insertLog(`start stream with wowza if not already startes`, `streamservice.ensureready`);
        const streamStatus = await this.wowza.getLiveStream(stream.wowzaId);
        const isReadyState = await this.wowza.isReadyState(streamStatus);
        if (!isReadyState) {
            this.logService.insertLog(`not in ready state, sending to Wowza to start`, `streamservice.ensureready`);
            this.startAndPoll(stream.id, stream.wowzaId).catch(async (err) => {
                await this.setPhase(stream.id, 'error', undefined, String(err?.message ?? err));
            });
        }

        return stream;
    }

    async stopLiveStream(wowzaId: string) {
        await this.wowza.stopLiveStream(wowzaId);
    }

    @Cron('*/10 * * * *') // every 1 min
    async cleanupStreams() {
        const streams = await this.repo.find({
            where: [
                // { isProvisioning: true },
                // { provisonedUser: Not(IsNull())/ },
            ],
        });
        for (var stream of streams) {
            const liveStream = await this.wowza.getLiveStream(stream.wowzaId);
            switch (liveStream.live_stream.state) {
                case 'stopped':
                    stream.phase = 'idle';
                    // stream.provisonedUser = null;
                    break;
                case 'starting':
                    break;
                case 'started':
                    const isStreaming = await this.wowza.isStreaming(stream.wowzaId);
                    stream.phase = isStreaming ? 'publishing' : 'ready';
                    break;
                default:
                    stream.phase = 'idle';
                    break;
            }
            await this.repo.save(stream);

        }
    }

    private async startAndPoll(id: number, wowzaId: string) {
        // start (idempotent if already started on Wowza)
        const stream = await this.wowza.getLiveStream(wowzaId);
        if (stream.live_stream.state.toLowerCase() === 'stopped') {
            await this.wowza.startLiveStream(wowzaId);
        }
        // progressive backoff: 2s,4s,6s,... up to ~90s
        const start = Date.now();
        let attempt = 0;
        while (Date.now() - start < 120_000) {
            attempt++;
            const ls = await this.wowza.getLiveStream(wowzaId);
            const wowzaState = ls?.live_stream?.state;

            // keep DB in sync + push status
            await this.setPhase(id, 'starting', wowzaState);

            if (await this.wowza.isReadyState(ls)) {
                await this.setPhase(id, 'ready', wowzaState);
                // await this.repo.update({ id }, { isProvisioning: false });
                return;
            }

            // sleep with bounded backoff
            const waitMs = Math.min(2000 + attempt * 1000, 8000);
            await new Promise((r) => setTimeout(r, waitMs));
        }

        await this.setPhase(id, 'error', undefined, 'Timed out waiting for Wowza to start.');
        // await this.repo.update({ id }, { isProvisioning: false });
    }

    private async setPhase(id: number, phase: 'starting' | 'ready' | 'error', wowzaState?: string, errorMessage?: string) {
        await this.repo.update({ id }, { phase });
        this.events.emit({ id, phase, wowzaState, errorMessage });
    }

    /** Optional: allow UI to cancel if user backs out before ready */
    async cancel(id: number) {
        // await this.repo.update({ id }, { phase: 'ended', isProvisioning: false });
        this.events.emit({ id, phase: 'ended' });
        this.events.complete(id);
    }

    async get(id: number) {
        return this.repo.findOneByOrFail({ id });
    }

    async getByStreamId(wowzaId: string): Promise<Stream | null> {
        return await this.repo.findOne({
            where: {
                wowzaId
            }
        })
    }

    async updateStreamPhase(id: number, isStarting: boolean): Promise<string> {
        var entity = await this.repo.findOne({
            where: {
                id
            }
        });
        if (entity == null) throw new NotFoundException();
        entity.phase = isStarting ? "publishing" : "ready";
        await this.repo.save(entity);
        return entity.wowzaId;
    }

    async terminate(id: number): Promise<void> {
        var entity = await this.repo.findOne({ where: { id } });
        if (entity == null) throw new NotFoundException();
        entity.phase = "ready";
        // entity.provisonedUser = null;
        await this.repo.save(entity);
    }

    async getStreams() {
        return await this.repo.find({ where: { phase: 'publishing' } })
    }
}