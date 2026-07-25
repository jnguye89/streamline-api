import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { VideoDto } from 'src/dto/video.dto';
import { Video, VideoStatus } from 'src/entity/video.entity';
import { In, Repository } from 'typeorm';

@Injectable()
export class VideoRepository {
  constructor(
    @InjectRepository(Video) private readonly videoRepo: Repository<Video>,
  ) { }

  async create(videoDto: VideoDto): Promise<VideoDto> {
    // make sure it doesn't already exist
    const entity = await this.videoRepo.find({
      where: {
        videoPath: videoDto.videoPath
      }
    })

    if (entity.length > 0) {
      return { ...entity[0] };
    }
    // const entity = this.mapper
    const video = this.videoRepo.create(
      { ...videoDto }
    );
    const savedVideo = await this.videoRepo.save(video)
    return { ...savedVideo };
  }

  async findByVideoPath(path: string): Promise<VideoDto> {
    var result = await this.videoRepo.findOne({
      where: [{ videoPath: path },
      { processedPath: path }]
    });
    return { ...result } as VideoDto;
  }

  async findAll(): Promise<VideoDto[]> {
    const entity = await this.videoRepo.find();
    return [...entity];
  }

  async findAllByUserId(userId: string): Promise<VideoDto[]> {
    var result = await this.videoRepo.find({ where: { user: userId } });
    return [...result]
  }

  /** Fetches videos by id, preserving the given order and silently dropping ids that no longer exist (e.g. soft-deleted). */
  async findByIds(ids: number[]): Promise<VideoDto[]> {
    if (ids.length === 0) return [];
    const entities = await this.videoRepo.find({ where: { id: In(ids) } });
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    return ids
      .map((id) => byId.get(id))
      .filter((video): video is Video => !!video)
      .map((video) => ({ ...video }));
  }

  async findAllIds(): Promise<number[]> {
    const rows = await this.videoRepo.find({ select: ['id'] });
    return rows.map((row) => row.id);
  }

  async softDelete(id: number): Promise<void> {
    console.log('repo', id);
    await this.videoRepo.softDelete(id);
  }

  async updateProcessingStatus(
    videoPath: string,
    status: VideoStatus,
    processedPath?: string,
  ): Promise<void> {
    await this.videoRepo.update(
      { videoPath },
      { status, ...(processedPath !== undefined ? { processedPath } : {}) },
    );
  }
}
