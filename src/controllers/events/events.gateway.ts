// events/events.gateway.ts
import { Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { WsJwtGuard } from 'src/auth/jwt-ws.guard';
import { getCorsOrigins } from 'src/cors-origins';
import { RecordingDto } from 'src/dto/events/chat-message.dto';
import { JoinRoomDto } from 'src/dto/events/join-room.dto';
import { EventsService } from 'src/services/events/events.service';

interface RoomEvent {
  userId?: string;
  socketId: string;
  roomId: string;
  agoraUserId?: number;
  streamName?: string;
}

interface ServerToClientEvents {
  'room:user-joined': (event: RoomEvent) => void;
  'room:user-left': (event: RoomEvent) => void;
  'recording:started': (event: RoomEvent) => void;
  'recording:stopped': (event: RoomEvent) => void;
}

type AuthenticatedSocket = Socket<
  Record<string, never>,
  ServerToClientEvents,
  Record<string, never>,
  { userId?: string }
>;

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly eventsService: EventsService) {}

  // Socket.IO server available here
  afterInit(): void {
    this.eventsService.setServer(this.server);
    this.logger.log('Gateway initialized');
  }

  handleConnection(client: AuthenticatedSocket): void {
    this.logger.log(`WS connected user=${client.data.userId}`);
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Join a room
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('room:join')
  async onJoinRoom(
    @MessageBody() body: JoinRoomDto,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{ ok: true; roomId: string }> {
    await client.join(body.roomId);
    this.logger.log(
      `user=${client.data.userId} joined room=${body.roomId} (socket=${client.id})`,
    );
    // notify room
    client.to(body.roomId).emit('room:user-joined', {
      userId: client.data.userId,
      socketId: client.id,
      roomId: body.roomId,
    });

    return { ok: true, roomId: body.roomId };
  }

  // Leave a room
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('room:leave')
  async onLeaveRoom(
    @MessageBody() body: JoinRoomDto,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{ ok: true; roomId: string }> {
    await client.leave(body.roomId);
    this.logger.log(
      `user=${client.data.userId} left room=${body.roomId} (socket=${client.id})`,
    );
    client.to(body.roomId).emit('room:user-left', {
      userId: client.data.userId,
      socketId: client.id,
      roomId: body.roomId,
    });
    return { ok: true, roomId: body.roomId };
  }

  @SubscribeMessage('recording:started')
  @UseGuards(WsJwtGuard)
  onRecordingStart(
    @MessageBody() body: RecordingDto,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): { ok: true; roomId: string } {
    this.logger.log(
      `user=${client.data.userId} started recording (socket=${client.id})`,
    );
    client.to(body.roomId).emit('recording:started', {
      userId: client.data.userId,
      socketId: client.id,
      roomId: body.roomId,
      agoraUserId: body.agoraUserId,
      streamName: body.streamName,
      // token: this.agoraTokenService.createTokens(`${body.agoraUserId}`, body.streamName),
    });
    return { ok: true, roomId: body.roomId };
  }

  @SubscribeMessage('recording:stopped')
  @UseGuards(WsJwtGuard)
  onRecordingStopped(
    @MessageBody() body: RecordingDto,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): { ok: true; roomId: string } {
    this.logger.log(
      `user=${client.data.userId} stopped recording (socket=${client.id})`,
    );
    client.to(body.roomId).emit('recording:stopped', {
      userId: client.data.userId,
      socketId: client.id,
      roomId: body.roomId,
    });
    return { ok: true, roomId: body.roomId };
  }
}
