import { Body, Controller, Get, Param, Post, Sse, MessageEvent, Put, Req, ConflictException } from "@nestjs/common";
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
import { LogService } from "src/services/log.service";

@Controller('stream')
export default class StreamController {
    constructor(
        private streamService: StreamService,
        private stremEvents: StreamsEvents,
        private publisherPresence: PublisherPresenceService,
        private wowzaService: WowzaService,
        private s3: S3Service,
        private videoService: VideoService,
        private logService: LogService
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
        return { id: s.id, phase: s.phase };
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
        const wowzaId = await this.streamService.updateStreamPhase(id, false);
        await this.streamService.stopLiveStream(wowzaId);
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
        await this.publisherPresence.leave(id, body.sessionId, 'beacon');
        return { ok: true };
    }

    @Post('webhook')
    @Public()
    async handleWowzaWebhook(@Body() payload: WowzaEventDto) {
        const type = payload?.event_type;
        const recordingId = payload.object_id;

        // Ignore unrelated events
        if (type !== 'video.ready') return { ok: true, ignored: true };

        const wowzaStreamId = payload.payload.origin.id;
        const stream = (await this.streamService.getByStreamId(wowzaStreamId));
        if (!stream) {
            await this.logService.insertLog('No user tied to this stream', 'streamController:webhook');
            return { ok: true, ignored: true };
        }
        const user = stream?.user.auth0UserId;
        if (!recordingId) {
            await this.logService.insertLog('No recording_id in webhook payload', 'streamController:webhook');
            return { ok: true, ignored: true };
        }

        // 1) Get Wowza recording (download_url + file_name)
        const { download_url, video_id, extension } = await this.wowzaService.getRecording(recordingId);
        // 2) Stream directly to S3
        const key = `uploads/wowza/${video_id}.${extension}`;
        const video = await this.videoService.getVideoByPath(key);
        if (!!video) {
            await this.logService.insertLog("Video with the same name already exist", 'streamController:webhook');
            return { ok: true, ignored: true };
        }
        const s3Key = await this.s3.streamUrlToS3(download_url, video_id, extension);
        // 3) Persist VOD metadata to your DB here (duration, owner, s3Key, etc.)
        this.videoService.uploadVideoToDb({
            user: user!,
            videoPath: s3Key
        });

        await this.wowzaService.deleteRecording(recordingId);
        return { ok: true, recordingId, s3Key };
    }
}