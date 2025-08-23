import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Public } from "src/auth/public.decorator";
import { StreamService } from "src/services/stream.service";
import { WowzaService } from "src/services/third-party/wowza.service";

@Controller('stream')
export class StreamController {
    constructor(private streamService: StreamService, private wowzaService: WowzaService) { }

    @Get()
    @Public()
    async getStreams() {
        const response = await this.streamService.findAll();
        return response;
    }

    @Get('usable')
    @Public()
    async getUsableStreams() {
        let streams = await this.streamService.findStreams(true, false);
        let result = (await Promise.all(
            streams.map(async (s) => {
                const status = await this.wowzaService.getStreamStatus(s.streamId);
                return { s, status };
            })
        ))
            .filter(({ status }) => status.isActive && !status.isLive) // keep active AND not live
            .map(({ s }) => s);
        
        // if (result.length == 0) {
        //     streams = await this.streamService.findStreams(false, false, 1);
        //     this.wowzaService.startStream(streams[0].streamId);
        //     result.push(streams[0]);
        // }
        return result;
    }

    @Post()
    @Public()
    async createStream() {
        await this.wowzaService.createStream();
    }

    @Get(':streamId/status')
    @Public()
    async getStreamStatus(@Param('streamId') streamId) {
        return await this.wowzaService.getStreamStatus(streamId);
    }
}