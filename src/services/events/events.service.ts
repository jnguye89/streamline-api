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

    // Targets one specific user's own personal room (joined via
    // EventsGateway's 'user:register' handler) rather than a shared room
    // like chess:{id} - for events that need to reach a user regardless of
    // what screen they're on or which room(s) they've joined, e.g. "it's
    // your turn" when they aren't currently looking at that game at all.
    notifyUser(userId: string, event: string, payload: unknown) {
        if (!this.io) return;
        this.io.to(`user:${userId}`).emit(event, payload);
    }
}
