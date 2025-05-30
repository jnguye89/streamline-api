// stream.gateway.ts
import {
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
    credentials: true,
  },
})
export class StreamGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(StreamGateway.name);
  private ffmpegMap = new Map<string, ChildProcessWithoutNullStreams>();

  afterInit(server: Server) {
    server.on('connection', (socket) => {
      console.log('Socket.IO raw connected:', socket.id);
      socket.on('disconnect', (reason) => {
        console.log('Socket.IO raw disconnect:', reason);
      });
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);

    const ffmpeg = spawn('ffmpeg', [
      '-re',
      '-i',
      'pipe:0',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-tune',
      'zerolatency',
      '-c:a',
      'aac',
      '-ar',
      '44100',
      '-b:a',
      '128k',
      '-f',
      'flv',
      'rtmps://3b7d4b5b28f6.global-contribute.live-video.net:443/app/sk_us-west-2_o7Qj4w0Hymqs_v7RiHpdGHgb54zph1fjZAd0aDzRICb',
    ]);

    ffmpeg.stderr.on('data', (data) => {
      this.logger.debug(data.toString());
    });

    this.ffmpegMap.set(client.id, ffmpeg);
  }

  @SubscribeMessage('stream-data')
  handleStream(client: Socket, payload: Buffer) {
    console.log(`Stream payload from ${client.id}:`, payload.length);
    try {
      const ffmpeg = this.ffmpegMap.get(client.id);
      if (ffmpeg) {
        ffmpeg.stdin.write(payload);
      }
    } catch (err) {
      console.error('Stream error:', err);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const ffmpeg = this.ffmpegMap.get(client.id);
    if (ffmpeg) {
      ffmpeg.stdin.end();
      ffmpeg.kill('SIGINT');
      this.ffmpegMap.delete(client.id);
    }
  }
}
