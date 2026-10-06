import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Multistream } from 'src/entity/multistream.entity';

@Injectable()
export class MultistreamRepository {
  constructor(
    @InjectRepository(Multistream)
    private readonly multistreamRepo: Repository<Multistream>,
  ) {}

  create(values: Partial<Multistream>): Promise<Multistream> {
    return this.multistreamRepo.save(this.multistreamRepo.create(values));
  }

  save(multistream: Multistream): Promise<Multistream> {
    return this.multistreamRepo.save(multistream);
  }

  /** Restreams for a channel that may still have a converter pushing. */
  findActiveByChannelName(channelName: string): Promise<Multistream[]> {
    return this.multistreamRepo.find({
      where: { channelName, status: In(['starting', 'active']) },
    });
  }
}
