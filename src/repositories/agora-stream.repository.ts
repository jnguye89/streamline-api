import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { AgoraStream } from "src/entity/agora-stream.entity";

@Injectable()
export class AgoraStreamRepository {
    constructor(@InjectRepository(AgoraStream) private readonly agoraStreamRepo) { }

    async findAll(): Promise<AgoraStream[]> {
        return this.agoraStreamRepo
            .createQueryBuilder('s')
            .where('s.status = :status', { status: 'live' })
            .andWhere('s.lastHeartbeatAt >= (UTC_TIMESTAMP() - INTERVAL 15 SECOND)')
            .orderBy('s.lastHeartbeatAt', 'DESC')
            .getMany();
    }


    async findByChannelName(channelName: string): Promise<AgoraStream | null> {
        return await this.agoraStreamRepo.findOne({ where: { channelName } });
    }

    async createNew(channelName: string, userId: string): Promise<AgoraStream> {
        const newStream = this.agoraStreamRepo.create({
            channelName,
            user: { auth0UserId: userId },
            status: 'created'
        });
        return await this.agoraStreamRepo.save(newStream);
    }

    async updateStatus(id: number, status: 'created' | 'live' | 'ended' | 'error'): Promise<AgoraStream> {
        const stream = await this.agoraStreamRepo.findOne({ where: { id } });
        stream.status = status;
        return await this.agoraStreamRepo.save(stream);
    }

    async save(stream: AgoraStream): Promise<AgoraStream> {
        await this.agoraStreamRepo.update({ id: stream.id }, stream);
        return await this.agoraStreamRepo.save(stream);
    }

    async heartbeat(channelName: string, uid?: string) {
        // Only update if the stream is in a state that can be "live"
        // (prevents resurrecting ended streams)
        await this.agoraStreamRepo
            .createQueryBuilder()
            .update(AgoraStream)
            .set({
                lastHeartbeatAt: () => 'CURRENT_TIMESTAMP',
                // optionally keep updatedAt in sync if you want:
                // updatedAt: () => 'CURRENT_TIMESTAMP',
            })
            .where('channelName = :channelName', { channelName })
            .andWhere(`status IN ('created','live')`)
            .execute();
    }
}