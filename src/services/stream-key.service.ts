import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StreamKeyRepository } from 'src/repositories/stream-key.repository';
import { StreamKey } from 'src/entity/stream-key.entity';
import { StreamPlatform } from 'src/enums/stream-platform.enum';

const PLATFORMS_REQUIRING_URL = new Set<StreamPlatform>([
  StreamPlatform.KICK,
  StreamPlatform.RUMBLE,
]);

@Injectable()
export class StreamKeyService {
  constructor(private streamKeyRepository: StreamKeyRepository) {}

  async saveStreamKey(
    userId: string,
    platform: StreamPlatform,
    streamKey: string,
    streamUrl?: string,
  ): Promise<StreamKey> {
    if (!Object.values(StreamPlatform).includes(platform)) {
      throw new BadRequestException(`Unsupported platform: ${platform}`);
    }
    if (!streamKey) {
      throw new BadRequestException('streamKey is required');
    }
    if (PLATFORMS_REQUIRING_URL.has(platform) && !streamUrl) {
      throw new BadRequestException(`streamUrl is required for ${platform}`);
    }

    return this.streamKeyRepository.upsert(
      userId,
      platform,
      streamKey,
      streamUrl,
    );
  }

  /** On or off for the next live. Only a platform with a saved key can be switched. */
  async setEnabled(
    userId: string,
    platform: StreamPlatform,
    enabled: unknown,
  ): Promise<StreamKey> {
    if (!Object.values(StreamPlatform).includes(platform)) {
      throw new BadRequestException(`Unsupported platform: ${platform}`);
    }
    if (typeof enabled !== 'boolean') {
      throw new BadRequestException('enabled must be true or false');
    }
    const key = await this.streamKeyRepository.setEnabled(
      userId,
      platform,
      enabled,
    );
    if (!key) {
      throw new NotFoundException(`No ${platform} stream key saved`);
    }
    return key;
  }

  getStreamKeysByUserId(userId: string): Promise<StreamKey[]> {
    return this.streamKeyRepository.findAllByUserId(userId);
  }
}
