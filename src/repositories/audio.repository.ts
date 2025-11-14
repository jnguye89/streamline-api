import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AudioDto } from 'src/dto/audio.dto';
import { Audio } from 'src/entity/audio.entity';
import { Repository } from 'typeorm';

@Injectable()
export class AudioRepository {
  constructor(
    @InjectRepository(Audio) private readonly audioRepo: Repository<Audio>,
  ) { }

  async create(audioDto: AudioDto): Promise<AudioDto> {
    // const entity = this.mapper.map(audioDto, AudioCreateDto, Audio);
    const entity = {
      ...audioDto
    } as Audio
    const audio = this.audioRepo.create(entity);
    // const newEntity = await this.audioRepo.save(audio);
    return { ...audio };
  }

  async findAll(): Promise<Audio[]> {
    return this.audioRepo.find();
  }

  async findAllByUserId(userId: string): Promise<Audio[]> {
    return this.audioRepo.find({ where: { user: userId } });
  }
}
