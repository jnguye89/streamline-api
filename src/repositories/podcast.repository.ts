import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Podcast } from "src/entity/podcast.entity";
import { Repository } from "typeorm";

@Injectable()
export class PodcastRepository {
    constructor(@InjectRepository(Podcast) private readonly podcastRepository: Repository<Podcast>) { }

    async addPodcast(dto: Podcast): Promise<Podcast> {
        const entity = await this.podcastRepository.save(dto);
        return entity;
    }

    async getPodcast(channelName: string): Promise<Podcast> {
        const entity = await this.podcastRepository.findOne({
            where: { channelName }
        })

        if (!entity) {
            throw new NotFoundException(`Podcast with channel name ${channelName} not found.`);
        }

        return entity;
    }

    async updatePodcast(dto: Podcast): Promise<Podcast> {
        const entity = await this.getPodcast(dto.channelName);
        this.podcastRepository.merge(entity, dto);
        return await this.podcastRepository.save(entity);
    }
}