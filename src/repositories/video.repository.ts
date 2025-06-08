import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { VideoDto } from 'src/dto/video.dto';
import { Video } from 'src/entity/video.entity';
import { Repository } from 'typeorm';

@Injectable()
export class VideoRepository {
  constructor(
    @InjectRepository(Video) private readonly videoRepo: Repository<Video>,
  ) {}

  async create(videoDto: VideoDto): Promise<Video> {
    const video = this.videoRepo.create(videoDto);
    return this.videoRepo.save(video);
  }

  async findAll(): Promise<Video[]> {
    return this.videoRepo.find();
  }

  async findAllByUserId(userId: string): Promise<Video[]> {
    return this.videoRepo.find({ where: { user: userId } });
  }
}
