// events/events.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class EventsService {
    private readonly logger = new Logger(EventsService.name);
    private io?: Server;

    setServer(io: Server) {
        this.io = io;
    }

    broadcastToRoom(roomId: string, event: string, payload: unknown) {
        if (!this.io) return;
        this.io.to(roomId).emit(event, payload);
    }
}
