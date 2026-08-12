import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YoutubeChannel } from 'src/entity/youtube-channel.entity';
import { YoutubeChannelDto } from 'src/dto/youtube-channel.dto';

@Injectable()
export class YoutubeChannelRepository {
  constructor(
    @InjectRepository(YoutubeChannel) private readonly repo: Repository<YoutubeChannel>,
  ) { }

  /** Every enabled channel across all users - used by the sync scheduler, which refreshes one shared/global cache. */
  async findAllEnabled(): Promise<YoutubeChannelDto[]> {
    const entities = await this.repo.find({ where: { enabled: true } });
    return entities.map((entity) => ({ ...entity }));
  }

  async findAllByUserId(userId: string): Promise<YoutubeChannelDto[]> {
    const entities = await this.repo.find({ where: { userId } });
    return entities.map((entity) => ({ ...entity }));
  }

  async findOneByIdAndUserId(id: number, userId: string): Promise<YoutubeChannelDto | null> {
    const entity = await this.repo.findOne({ where: { id, userId } });
    return entity ? { ...entity } : null;
  }

  async create(dto: YoutubeChannelDto): Promise<YoutubeChannelDto> {
    const channel = this.repo.create({ ...dto });
    const saved = await this.repo.save(channel);
    return { ...saved };
  }

  /** Returns false if no row matched (not found, or not owned by userId). */
  async update(id: number, userId: string, patch: Partial<YoutubeChannelDto>): Promise<boolean> {
    const result = await this.repo.update({ id, userId }, patch);
    return !!result.affected;
  }

  /** Returns false if no row matched (not found, or not owned by userId). */
  async delete(id: number, userId: string): Promise<boolean> {
    const result = await this.repo.delete({ id, userId });
    return !!result.affected;
  }
}
