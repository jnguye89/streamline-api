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
  transports: ['websocket'], // keep WS-only if you like
  maxHttpBufferSize: 20 * 1024 * 1024, // 20 MB per message (tune as needed)
})
export class StreamGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(StreamGateway.name);
  private ffmpegMap = new Map<string, ChildProcessWithoutNullStreams>();

  afterInit(server: Server) {
    server.on('connection', (socket) => {
      console.log('Socket.IO raw connected:', socket.id);
      socket.on('disconnect', (reason) =>
        this.logger.warn(`Disconnected: ${reason}`),
      );
      socket.conn.on('close', (reason: string) =>
        this.logger.warn(`Engine-IO close: ${reason}`),
      );
    });
  } // stream.gateway.ts
  handleConnection(client: Socket) {
    this.logger.log(`Client connected ${client.id}`);

    const ffmpeg = spawn(
      'ffmpeg',
      [
        /* INPUT ---------------------------------------------------- */
        '-loglevel',
        'error', // quieter log
        '-f',
        'webm', // we know the container type now
        '-i',
        'pipe:0', // read from stdin

        /* TRANSCODE ------------------------------------------------ */
        // Video: re-encode to H.264 baseline, tune for realtime
        '-c:v',
        'libx264',
        '-profile:v',
        'baseline',
        '-preset',
        'veryfast',
        '-tune',
        'zerolatency',
        // Audio: re-encode Opus → AAC
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-b:a',
        '128k',

        /* OUTPUT --------------------------------------------------- */
        '-pix_fmt',
        'yuv420p',
        '-f',
        'flv',
        'rtmps://3b7d4b5b28f6.global-contribute.live-video.net:443/app/sk_us-west-2_o7Qj4w0Hymqs_v7RiHpdGHgb54zph1fjZAd0aDzRICb', // rtmps://…/app/<stream-key>
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );

    /* ---- GUARD RAILS ----------------------- */
    ffmpeg.on('exit', (code, sig) => {
      this.logger.error(`FFmpeg exited code=${code} signal=${sig}`);
      client.disconnect(true); // tell the browser
    });

    ffmpeg.stdin.on('error', (err) =>
      this.logger.error(`stdin error: ${err.message}`),
    );

    this.ffmpegMap.set(client.id, ffmpeg);
  }

  @SubscribeMessage('stream-data')
  handleStream(client: Socket, payload: Buffer) {
    const ff = this.ffmpegMap.get(client.id);
    if (!ff || !ff.stdin.writable) return;

    /* back-pressure: if write() returns false pause the socket */
    if (!ff.stdin.write(payload)) {
      client.conn.pause();
      ff.stdin.once('drain', () => client.conn.resume());
    }
  }

  handleDisconnect(client: Socket) {
    const ff = this.ffmpegMap.get(client.id);
    ff?.stdin.end();
    ff?.kill('SIGINT');
    this.ffmpegMap.delete(client.id);
  }
}
