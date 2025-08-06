// src/streams/streams.controller.ts
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { WowzaService } from 'src/services/third-party/wowza.service';
import { CreateStreamDto } from 'src/dto/create-stream.dto';
import { PlaybackDto } from 'src/dto/playback.dto';
import { Public } from 'src/auth/public.decorator';

@Controller('streams')
export class StreamsController {
  constructor(private readonly wowza: WowzaService) {}

  @Post()
  async create(@Body() dto: CreateStreamDto): Promise<PlaybackDto> {
    return await this.wowza.createLiveStream(dto);
  }

  @Get(':id')
  @Public()
  getStream(@Param('id') id: string) {
    return this.wowza.getStream(id);
  }

  @Put(':id/start')
  start(@Param('id') id: string) {
    return this.wowza.startStream(id);
  }

  @Put(':id/stop')
  stop(@Param('id') id: string) {
    return this.wowza.stopStream(id);
  }

  @Get(':id/playback')
  getPlayback(@Param('id') id: string): Promise<PlaybackDto> {
    return this.wowza.getPlayback(id);
  }
}
