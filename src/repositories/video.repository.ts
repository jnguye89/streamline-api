import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { VideoDto } from 'src/dto/video.dto';
import { Video } from 'src/entity/video.entity';
import { Repository } from 'typeorm';

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
      where: {
        videoPath: path
      }
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
}
