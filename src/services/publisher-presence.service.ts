// publisher-presence.service.ts
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Stream } from 'src/entity/stream.entity';

type SessionSet = Set<string>;

@Injectable()
export class PublisherPresenceService {
    private active: Map<number, SessionSet> = new Map(); // streamId -> sessionIds
    private timers: Map<number, NodeJS.Timeout> = new Map(); // deferred cleanup per stream
    private GRACE_MS = 5000; // allow SSE auto-reconnects

    constructor(@InjectRepository(Stream) private repo: Repository<Stream>) { }

    async markPublishing(id: number) {
        await this.repo.update({ id }, { phase: 'publishing' });
    }

    async createSession(streamId: number) {
        const id = randomUUID();
        (this.active.get(streamId) ?? this.active.set(streamId, new Set()).get(streamId)!).add(id);
        return id;
    }

    attach(req: Request, streamId: number, sessionId: string) {
        // Ensure session is tracked even if SSE is opened directly (bookmark, reload)
        if (!this.active.has(streamId)) this.active.set(streamId, new Set());
        this.active.get(streamId)!.add(sessionId);

        req.on('close', () => this.leave(streamId, sessionId, 'disconnect'));
    }

    async leave(streamId: number, sessionId: string, reason: 'disconnect' | 'beacon') {
        const set = this.active.get(streamId);
        if (set) {
            set.delete(sessionId);
            if (set.size === 0) this.scheduleCleanup(streamId);
        } else {
            // No memory record (server restart). Still schedule a cleanup.
            this.scheduleCleanup(streamId);
        }
    }

    private scheduleCleanup(streamId: number) {
        // Debounce: cancel prior timer
        const prev = this.timers.get(streamId);
        if (prev) clearTimeout(prev);

        const t = setTimeout(() => this.maybeMarkReady(streamId), this.GRACE_MS);
        this.timers.set(streamId, t);
    }

    private async maybeMarkReady(streamId: number) {
        this.timers.delete(streamId);
        const set = this.active.get(streamId);
        const noPublishers = !set || set.size === 0;

        if (noPublishers) {
            // Optional: double-check against Wowza bits_in_rate > 0 if you want
            await this.repo.update({ id: streamId }, { phase: 'ready', provisonedUser: null });
        }
    }
}
