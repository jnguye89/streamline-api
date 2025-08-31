import { Body, Controller, Get, Param, Post, Sse, MessageEvent, Put, Req } from "@nestjs/common";
import { interval, map, Observable } from "rxjs";
import { User } from "src/auth/user.decorator";
import { UserDto } from "src/dto/user.dto";
import { PublisherPresenceService } from "src/services/publisher-presence.service";
import { StreamService } from "src/services/stream.service";
import { StreamsEvents } from "src/services/third-party/streams.events";
import { Request } from 'express';
import { Public } from "src/auth/public.decorator";
import { Stream } from "src/entity/stream.entity";

@Controller('stream')
export class StreamController {
    constructor(
        private streamService: StreamService,
        private stremEvents: StreamsEvents,
        private publisherPresence: PublisherPresenceService
    ) { }

    @Get()
    @Public()
    async getStreams(): Promise<Stream[]> {
        return await this.streamService.getStreams();
    }

    /** Start (or reuse) and begin pushing updates */
    @Post('ensure-ready')
    async ensureReady(@User() user: UserDto, @Body() dto: { broadcastLocation: string; }) {
        const s = await this.streamService.ensureReady(dto.broadcastLocation, user.userId);
        return s;
    }

    /** Simple status fetch (optional) */
    @Get(':id')
    async get(@Param('id') id: string) {
        const s = await this.streamService.get(Number(id));
        return { id: s.id, phase: s.phase, wowzaState: s.lastWowzaState, errorMessage: s.errorMessage };
    }

    /** Server-Sent Events stream */
    @Sse(':id/updates')
    @Public()
    updates(@Param('id') id: string): Observable<MessageEvent> {
        const subj = this.stremEvents['subjectFor'](Number(id));
        return subj.pipe(map((data) => ({ data })));
    }

    /** Allow cancel from UI */
    @Post(':id/cancel')
    async cancel(@Param('id') id: string) {
        await this.streamService.cancel(Number(id));
        return { ok: true };
    }

    @Put(':id/stop')
    async stop(@Param('id') id: number) {
        await this.streamService.updateStreamPhase(id, false)
    }

    @Put(':id/start')
    async start(@Param('id') id: number) {
        await this.publisherPresence.markPublishing(id);
        const sessionId = await this.publisherPresence.createSession(id);
        return { sessionId };
    }

    // Long-lived SSE while the publisher page is open
    @Sse(':id/publisher-presence')
    @Public()
    presenceSse(@Param('id') id: number, @Req() req: Request): Observable<MessageEvent> {
        const sessionId = String(req.query.sessionId ?? '');
        this.publisherPresence.attach(req, id, sessionId); // wires req.on('close')
        // keep connection warm; browsers ignore the data but it prevents idle timeouts
        return interval(15000).pipe(map(() => ({ type: 'ka', data: 'ok' } as MessageEvent)));
    }

    // Beacon fallback on pagehide
    @Post(':id/publish/leave')
    async leave(@Param('id') id: number, @Body() body: { sessionId: string }) {
        console.log('publish/leave');
        await this.publisherPresence.leave(id, body.sessionId, 'beacon');
        return { ok: true };
    }
}