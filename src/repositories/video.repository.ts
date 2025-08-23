import { Mapper } from '@automapper/core';
import { InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { VideoDto } from 'src/dto/video.dto';
import { Video } from 'src/entity/video.entity';
import { Repository } from 'typeorm';

@Injectable()
export class VideoRepository {
  constructor(
    @InjectMapper() private readonly mapper: Mapper,
    @InjectRepository(Video) private readonly videoRepo: Repository<Video>,
  ) {}

  async create(videoDto: VideoDto): Promise<VideoDto> {
    // const entity = this.mapper
    const video = this.videoRepo.create(
      this.mapper.map(videoDto, VideoDto, Video),
    );
    return this.mapper.map(await this.videoRepo.save(video), Video, VideoDto);
  }

  async findAll(): Promise<VideoDto[]> {
    const entity = await this.videoRepo.find();
    const mapped = this.mapper.mapArray(entity, Video, VideoDto);
    return mapped;
  }

  async findAllByUserId(userId: string): Promise<VideoDto[]> {
    return this.mapper.mapArray(
      await this.videoRepo.find({ where: { user: userId } }),
      Video,
      VideoDto,
    );
  }
}
