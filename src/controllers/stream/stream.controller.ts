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
import { WowzaEventDto } from "src/dto/wowza/wowza-event.dto";
import { WowzaService } from "src/services/third-party/wowza.service";
import { S3Service } from "src/services/third-party/s3.service";
import { VideoService } from "src/services/video.service";

@Controller('stream')
export default class StreamController {
    constructor(
        private streamService: StreamService,
        private stremEvents: StreamsEvents,
        private publisherPresence: PublisherPresenceService,
        private wowzaService: WowzaService,
        private s3: S3Service,
        private videoService: VideoService
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

    @Post('test')
    @Public()
    logWebhook(@Body() test: any) {
        console.log(test)
    }


    @Post('webhook')
    @Public()
    async handleWowzaWebhook(@Body() payload: WowzaEventDto) {
        // Optional: verify a shared secret signature here if configured.

        // Accept a few possible shapes:
        // { type: 'recording.completed', data: { recording_id, ... } }
        // or { event_type: 'recording.completed', recording_id: '...' }
        // or custom payload mapping to your workflow.
        const type = payload?.event_type;
        const recordingId = payload.object_id;
        console.log(type);

        // Ignore unrelated events
        if (type !== 'video.ready') return { ok: true, ignored: true };

        if (!recordingId) throw new Error('No recording_id in webhook payload');

        // 1) Get Wowza recording (download_url + file_name)
        const { download_url, video_id, extension } = await this.wowzaService.getRecording(recordingId);
        // 2) Stream directly to S3
        const s3Key = await this.s3.streamUrlToS3(download_url, video_id, extension);
        // 3) Persist VOD metadata to your DB here (duration, owner, s3Key, etc.)
        // TODO: assign it to the correct user
        this.videoService.uploadVideoToDb({
            user: 'auth0|68d9e24125d121501c3a47f7',
            videoPath: s3Key
        });
        await this.wowzaService.deleteRecording(recordingId);
        return { ok: true, recordingId, s3Key };
    }
}