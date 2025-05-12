import { Media } from "../entities/media.entity";

async function getMediaByUser(userId: string): Promise<Media[]> {
    const media = await Media.findAll({
        where: {
            userId
        },
    });

    return media;
}

