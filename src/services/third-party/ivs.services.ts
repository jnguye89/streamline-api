// ivs.service.ts
import { Injectable } from '@nestjs/common';
import { IvsClient, GetStreamCommand } from '@aws-sdk/client-ivs';

@Injectable()
export class IvsService {
  private client = new IvsClient({ region: 'us-west-2' });

  async isStreamLive(channelArn: string): Promise<boolean> {
    const command = new GetStreamCommand({ channelArn });

    try {
      const result = await this.client.send(command);
      return !!result.stream;
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        return false; // Not live
      }
      throw error;
    }
  }
}
