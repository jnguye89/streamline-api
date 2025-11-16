// events/events.gateway.ts
import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { EventsService } from 'src/services/events/events.service';
import { JoinRoomDto } from 'src/dto/events/join-room.dto';
import { RecordingDto } from 'src/dto/events/chat-message.dto';
import { ExceptionsHandler } from '@nestjs/core/exceptions/exceptions-handler';
import { WsJwtGuard } from 'src/auth/jwt-ws.guard';

// @UseGuards(WsJwtGuard) // 🔐 all events & connections require valid JWT
@WebSocketGateway({
    namespace: '/ws',
    cors: {
        origin: ['http://localhost:4200', 'https://skriin.com'], // adjust to your UI
        credentials: true,
    },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(EventsGateway.name);

    @WebSocketServer()
    server!: Server;

    constructor(private readonly eventsService: EventsService) { }

    // Socket.IO server available here
    afterInit() {
        this.eventsService.setServer(this.server);
        this.logger.log('Gateway initialized');
    }

    handleConnection(client: Socket) {
        this.logger.log(`WS connected user=${client.data.userId}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    // Join a room
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('room:join')
    onJoinRoom(
        @MessageBody() body: JoinRoomDto,
        @ConnectedSocket() client: Socket,
    ) {
        const userId = client.data.userId;
        client.join(body.roomId);
        this.logger.log(
            `user=${client.data.userId} joined room=${body.roomId} (socket=${client.id})`,
        );
        // notify room
        client.to(body.roomId).emit('room:user-joined', {
            // client.emit('room:user-joined', {
            // this.server.to(body.roomId).emit('room:user-joined', {
            userId: client.data.userId,
            socketId: client.id,
            roomId: body.roomId,
        });

        return { ok: true, roomId: body.roomId };
    }

    // Leave a room
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('room:leave')
    onLeaveRoom(
        @MessageBody() body: JoinRoomDto,
        @ConnectedSocket() client: Socket,
    ) {
        client.leave(body.roomId);
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
        @MessageBody() body: RecordingDto, @ConnectedSocket() client: Socket) {
        this.logger.log(`user=${client.data.userId} started recording (socket=${client.id})`);
        client.to(body.roomId).emit('recording:started', {
            userId: client.data.userId,
            socketId: client.id,
            roomId: body.roomId,
        });
        return { ok: true, roomId: body.roomId };
    }

    @SubscribeMessage('recording:stopped')
    @UseGuards(WsJwtGuard)
    onRecordingStopped(
        @MessageBody() body: RecordingDto, @ConnectedSocket() client: Socket) {
        this.logger.log(`user=${client.data.userId} started recording (socket=${client.id})`);
        client.to(body.roomId).emit('recording:stopped', {
            userId: client.data.userId,
            socketId: client.id,
            roomId: body.roomId,
        });
        return { ok: true, roomId: body.roomId };
    }

    // Example: ping/pong / heartbeat
    // @SubscribeMessage('system:ping')
    // onPing(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    //     console.log('data', data);
    //     console.log('Received:', client);
    //     client.emit('system:pong', { ts: Date.now() });
    // }

    // @SubscribeMessage('message')
    // handleMessage(@MessageBody() data: any): string {
    //     console.log('Received:', data);
    //     return 'pong';
    // }
}
