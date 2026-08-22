import { Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

import { WsJwtGuard } from 'src/auth/jwt-ws.guard';
import { getCorsOrigins } from 'src/cors-origins';
import { ChessMoveDto } from 'src/dto/chess/chess-move.dto';
import { ChessService } from 'src/services/chess/chess.service';

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  { userId?: string }
>;

type Ack = { ok: true } | { ok: false; error: string };

// A second gateway class on the *same* '/ws' namespace as EventsGateway -
// NestJS supports multiple gateways sharing one namespace, so the browser
// keeps its single existing socket connection (see RecordingSocketService)
// and this file only has to own the one thing that genuinely needs a
// low-latency round trip: submitting a move. Room membership
// (join/leave `chess:{id}`) reuses EventsGateway's existing generic
// `room:join`/`room:leave` handlers unchanged, and the actual broadcast
// back out to the room happens inside ChessService itself (via
// EventsService), not here - that way join/move/resign all notify the room
// consistently regardless of whether they came in over this socket or the
// plain REST endpoints in ChessController.
@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
})
export class ChessGateway {
  private readonly logger = new Logger(ChessGateway.name);

  constructor(private readonly chessService: ChessService) {}

  // Hard-guarded (WsJwtGuard, not the Optional variant used for chat/room
  // membership) - an unauthenticated socket is rejected outright. Beyond
  // that, ChessService also checks the caller's userId against whichever
  // seat's turn it actually is, so being logged in is necessary but not
  // sufficient to move a piece.
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chess:move')
  async onMove(
    @MessageBody() body: ChessMoveDto,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<Ack> {
    const userId = client.data.userId;
    if (!userId) return { ok: false, error: 'Unauthorized' };

    try {
      const result = await this.chessService.applyMove(
        body.gameId,
        userId,
        body.from,
        body.to,
        body.promotion,
      );
      this.logger.log(
        `chess move game=${body.gameId} ${result.san} by user=${userId}`,
      );
      return { ok: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Move rejected';
      return { ok: false, error: message };
    }
  }
}
