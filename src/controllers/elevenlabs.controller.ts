import { Controller, Get } from '@nestjs/common';
import { Public } from 'src/auth/public.decorator';
import { ElevenLabsService } from 'src/services/third-party/elevenlabs.service';

@Controller('elevenlabs')
export class ElevenLabsController {
  constructor(private readonly elevenLabsService: ElevenLabsService) {}

  @Get('session')
  @Public()
  async getSession(): Promise<{ signedUrl: string }> {
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    console.log(agentId);
    if (!agentId) {
      throw new Error('Missing ELEVENLABS_AGENT_ID environment variable');
    }
    const signedUrl = await this.elevenLabsService.getConvaiSignedUrl(agentId);
    return { signedUrl };
  }

  /** WebRTC conversation token for the mobile app's Yap (its SDK has no WebSocket mode). */
  @Get('token')
  @Public()
  async getToken(): Promise<{ token: string }> {
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    if (!agentId) {
      throw new Error('Missing ELEVENLABS_AGENT_ID environment variable');
    }
    const token = await this.elevenLabsService.getConvaiConversationToken(agentId);
    return { token };
  }
}
