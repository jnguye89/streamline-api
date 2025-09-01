import { Injectable, NotFoundException } from "@nestjs/common";
import { StreamDto } from "src/dto/stream.dto";
import { Stream } from "src/entity/stream.entity";
import { StreamRepository } from "src/repositories/stream.repository";
import { IsNull, Repository } from "typeorm";
import { WowzaService } from "./third-party/wowza.service";
import { StreamsEvents } from "./third-party/streams.events";
import { InjectRepository } from "@nestjs/typeorm";
import { Mapper } from "@automapper/core";
import { InjectMapper } from "@automapper/nestjs";

@Injectable()
export class StreamService {
    constructor(@InjectMapper() private readonly mapper: Mapper, private streamRepo: StreamRepository, @InjectRepository(Stream) private repo: Repository<Stream>, private wowza: WowzaService, private events: StreamsEvents) { }

    async findAll(): Promise<StreamDto[]> {
        return await this.streamRepo.findAll();
    }

    async findStreams(isActive: boolean, isLive: boolean, count?: number): Promise<StreamDto[]> {
        return await this.streamRepo.findStream(isActive, isLive, count);
    }

    /** Return an existing ready/starting stream OR start one and begin polling */
    async ensureReady(broadcastLocation: string, user: string): Promise<Stream> {
        // 1) Already ready?
        const ready = await this.repo.find({
            where: { broadcastLocation, phase: 'ready', provisonedUser: IsNull() },
            order: { updatedAt: 'DESC' },
        });
        if (ready.length > 0) {
            for (const r of ready) {
                const stream = await this.wowza.getLiveStream(r.wowzaId);
                if (await this.wowza.isReadyState(stream)) {
                    const newStream = this.repo.save({
                        ...r,
                        provisonedUser: user
                    })
                    return newStream;
                }
                else {
                    this.repo.save({
                        ...r,
                        phase: 'idle',
                        provisonedUser: null
                    })
                }
            }
        }

        // 2) Start if none ready
        const idle = await this.repo.find({
            where: { broadcastLocation, phase: 'idle', isProvisioning: false },
            order: { updatedAt: 'DESC' },
        });
        let newStream: Stream;
        if (idle.length > 0) {
            const stream = await this.wowza.getLiveStream(idle[0].wowzaId);
            if (stream.live_stream.state === 'started') {
                const entity = idle[0];
                entity.phase = 'ready';
                entity.provisonedUser = user;
                await this.repo.save(entity);
                return entity;
            }
            newStream = idle[0];
            newStream.isProvisioning = true;
            newStream.provisonedUser = user;
            newStream = await this.repo.save(newStream);
        } else {
            let streamDto = await this.wowza.createStream();
            newStream = await this.repo.save({
                wowzaId: streamDto.wowzaId,
                broadcastLocation: streamDto.broadcastLocation,
                phase: 'idle',
                isProvisioning: true,
                wssStreamUrl: streamDto.wssStreamUrl,
                applicationName: streamDto.applicationName,
                provisonedUser: user,
                streamName: streamDto.streamName
            });
        }

        // 4) Fire-and-forget: start and poll
        this.startAndPoll(newStream.id, newStream.wowzaId).catch(async (err) => {
            await this.setPhase(newStream.id, 'error', undefined, String(err?.message ?? err));
        });
        return newStream;
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
                await this.repo.update({ id }, { isProvisioning: false });
                return;
            }

            // sleep with bounded backoff
            const waitMs = Math.min(2000 + attempt * 1000, 8000);
            await new Promise((r) => setTimeout(r, waitMs));
        }

        await this.setPhase(id, 'error', undefined, 'Timed out waiting for Wowza to start.');
        await this.repo.update({ id }, { isProvisioning: false });
    }

    private async setPhase(id: number, phase: 'starting' | 'ready' | 'error', wowzaState?: string, errorMessage?: string) {
        await this.repo.update({ id }, { phase, lastWowzaState: wowzaState, errorMessage });
        this.events.emit({ id, phase, wowzaState, errorMessage });
    }

    /** Optional: allow UI to cancel if user backs out before ready */
    async cancel(id: number) {
        await this.repo.update({ id }, { phase: 'ended', isProvisioning: false });
        this.events.emit({ id, phase: 'ended' });
        this.events.complete(id);
    }

    async get(id: number) {
        return this.repo.findOneByOrFail({ id });
    }

    async updateStreamPhase(id: number, isStarting: boolean): Promise<void> {
        var entity = await this.repo.findOne({
            where: {
                id
            }
        });
        if (entity == null) throw new NotFoundException();
        entity.phase = isStarting ? "publishing" : "ready";
        await this.repo.save(entity);
    }

    async terminate(id: number): Promise<void> {
        var entity = await this.repo.findOne({ where: { id } });
        if (entity == null) throw new NotFoundException();
        entity.phase = "ready";
        entity.provisonedUser = null;
        await this.repo.save(entity);
    }

    async getStreams() {
        return await this.repo.find({ where: { phase: 'publishing' } })
    }
}