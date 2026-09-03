import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Chess } from 'chess.js';

import { ChessColor, ChessGame } from 'src/entity/chess-game.entity';
import { ChessGameRepository } from 'src/repositories/chess-game.repository';
import { EventsService } from 'src/services/events/events.service';
import { UserService } from 'src/services/user.service';

export interface ChessMoveResult {
  game: ChessGame;
  from: string;
  to: string;
  san: string;
}

@Injectable()
export class ChessService {
  constructor(
    private readonly chessGameRepo: ChessGameRepository,
    private readonly userService: UserService,
    private readonly eventsService: EventsService,
  ) {}

  async listOpenGames(): Promise<ChessGame[]> {
    return this.chessGameRepo.findOpen();
  }

  async getGame(id: number): Promise<ChessGame> {
    const game = await this.chessGameRepo.findById(id);
    if (!game) {
      throw new NotFoundException('Game not found');
    }
    return game;
  }

  // "Play Chess" always used to spin up a brand-new game unconditionally,
  // which is exactly why two people clicking it back to back never ended up
  // in the same room: the watch-feed's single-slot chess$ pipeline already
  // knows to show an open seat instead of the demo placeholder when one
  // exists, but the actual button that STARTS a game never checked for one
  // before acting, so the second player got their own fresh waiting room
  // instead of landing in the first player's. This now applies the same
  // "join an open seat if one exists, otherwise start one" rule to the
  // action itself, not just to what the feed displays.
  async createGame(userId: string): Promise<ChessGame> {
    const userLocalId = await this.ensureLocalUser(userId);

    // findOpen() is ordered newest-first; reversed here so matching prefers
    // whichever open seat has been waiting longest, rather than always
    // grabbing whatever was just created a moment ago.
    const openGames = await this.chessGameRepo.findOpen();
    const openSeat = [...openGames]
      .reverse()
      .find(
        (g) =>
          g.status === 'waiting' &&
          !g.blackUser &&
          g.whiteUser?.auth0UserId !== userLocalId,
      );

    if (openSeat) {
      try {
        return await this.joinGame(openSeat.id, userId);
      } catch {
        // Someone else grabbed this exact seat in the tiny gap between the
        // query above and the join below - fall through to starting a
        // fresh game instead of failing the click outright.
      }
    }

    return this.chessGameRepo.createNew(userLocalId);
  }

  // Broadcasting lives here (not in the controller/gateway) so it fires no
  // matter which entry point triggered the change - a player joining,
  // moving, or resigning notifies everyone else in the room (the creator
  // waiting for an opponent, spectators, the other player) in realtime
  // either way, rather than only whichever transport happened to receive
  // the request.
  async joinGame(id: number, userId: string): Promise<ChessGame> {
    const game = await this.getGame(id);
    if (game.status !== 'waiting') {
      throw new BadRequestException('This game is not open to join');
    }
    if (game.whiteUser.auth0UserId === userId) {
      throw new BadRequestException('You are already in this game');
    }

    const blackUserId = await this.ensureLocalUser(userId);
    await this.chessGameRepo.setBlackUserAndActivate(id, blackUserId);
    const saved = await this.getGame(id); // re-fetch, fully hydrated with the new blackUser relation

    this.eventsService.broadcastToRoom(this.roomFor(id), 'chess:joined', {
      gameId: id,
      blackUser: saved.blackUser,
      status: saved.status,
      turn: saved.turn,
    });
    return saved;
  }

  // Server-authoritative: the client's claimed board state is never
  // trusted. The move is re-validated against this game's own stored `fen`
  // via chess.js, exactly the way stream ownership is re-checked server-side
  // before publish/unpublish rather than taking the client's word for it.
  async applyMove(
    id: number,
    userId: string,
    from: string,
    to: string,
    promotion?: string,
  ): Promise<ChessMoveResult> {
    const game = await this.getGame(id);
    if (game.status !== 'active') {
      throw new BadRequestException('Game is not active');
    }

    const seat = this.seatFor(game, userId);
    if (!seat) {
      throw new ForbiddenException('You are not a player in this game');
    }
    if (seat !== game.turn) {
      throw new ForbiddenException('It is not your turn');
    }

    const chess = new Chess(game.fen);
    let move;
    try {
      move = chess.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      move = null;
    }
    if (!move) {
      throw new BadRequestException('Illegal move');
    }

    game.fen = chess.fen();
    game.pgn = chess.pgn();
    game.turn = chess.turn() === 'w' ? 'white' : 'black';
    // Making a move implicitly lapses any standing draw offer, the same as
    // over the board - whoever wants a draw has to ask again.
    game.drawOfferedBy = null;
    // A new turn just started for whoever `game.turn` now says is to move -
    // resets the clock ChessTimeoutSchedulerService checks against.
    game.turnStartedAt = new Date();

    if (chess.isCheckmate()) {
      game.status = 'checkmate';
      game.winner = seat;
      game.endedAt = new Date();
    } else if (chess.isStalemate()) {
      game.status = 'stalemate';
      game.winner = 'draw';
      game.endedAt = new Date();
    } else if (chess.isDraw()) {
      game.status = 'draw';
      game.winner = 'draw';
      game.endedAt = new Date();
    }

    const saved = await this.chessGameRepo.save(game);

    this.eventsService.broadcastToRoom(this.roomFor(id), 'chess:move', {
      gameId: id,
      from,
      to,
      san: move.san,
      fen: saved.fen,
      turn: saved.turn,
      status: saved.status,
      winner: saved.winner,
      drawOfferedBy: saved.drawOfferedBy,
    });
    return { game: saved, from, to, san: move.san };
  }

  async resign(id: number, userId: string): Promise<ChessGame> {
    const game = await this.getGame(id);
    const seat = this.seatFor(game, userId);
    if (!seat) {
      throw new ForbiddenException('You are not a player in this game');
    }

    if (game.status === 'waiting') {
      // No opponent ever joined - the creator is just cancelling, not
      // conceding a game that was actually played.
      game.status = 'abandoned';
      game.winner = null;
    } else if (game.status === 'active') {
      game.status = 'resigned';
      game.winner = seat === 'white' ? 'black' : 'white';
    } else {
      throw new BadRequestException('Game has already ended');
    }

    game.drawOfferedBy = null;
    game.endedAt = new Date();
    const saved = await this.chessGameRepo.save(game);

    this.eventsService.broadcastToRoom(this.roomFor(id), 'chess:ended', {
      gameId: id,
      status: saved.status,
      winner: saved.winner,
    });
    return saved;
  }

  // Called periodically by ChessTimeoutSchedulerService, never from a
  // request - nobody may be calling this API at all while a player is away,
  // which is exactly the case this exists to catch. Whichever seat's turn
  // it currently is loses (their opponent wasn't the one who went quiet),
  // same winner-assignment shape as resign() but a distinct 'timeout'
  // status so the UI can say "X wins by timeout" rather than implying they
  // chose to resign.
  async autoResignStaleTurns(timeoutMs: number): Promise<ChessGame[]> {
    const cutoff = new Date(Date.now() - timeoutMs);
    const staleGames = await this.chessGameRepo.findStaleActiveGames(cutoff);

    const resigned: ChessGame[] = [];
    for (const game of staleGames) {
      const absentSeat = game.turn;
      game.status = 'timeout';
      game.winner = absentSeat === 'white' ? 'black' : 'white';
      game.drawOfferedBy = null;
      game.endedAt = new Date();

      const saved = await this.chessGameRepo.save(game);
      resigned.push(saved);

      this.eventsService.broadcastToRoom(this.roomFor(game.id), 'chess:ended', {
        gameId: game.id,
        status: saved.status,
        winner: saved.winner,
      });
    }
    return resigned;
  }

  // Called periodically by ChessTimeoutSchedulerService, same as
  // autoResignStaleTurns above - but for games that never got a second
  // player at all. There's no opponent to award a win to here (nobody ever
  // showed up), so this ends the game as 'abandoned' with no winner, the
  // same terminal state resign() already uses when the creator themselves
  // backs out of their own still-waiting game.
  async autoAbandonStaleWaitingGames(timeoutMs: number): Promise<ChessGame[]> {
    const cutoff = new Date(Date.now() - timeoutMs);
    const staleGames = await this.chessGameRepo.findStaleWaitingGames(cutoff);

    const abandoned: ChessGame[] = [];
    for (const game of staleGames) {
      game.status = 'abandoned';
      game.winner = null;
      game.endedAt = new Date();

      const saved = await this.chessGameRepo.save(game);
      abandoned.push(saved);

      this.eventsService.broadcastToRoom(this.roomFor(game.id), 'chess:ended', {
        gameId: game.id,
        status: saved.status,
        winner: saved.winner,
      });
    }
    return abandoned;
  }

  // Offering, accepting, and declining a draw are plain REST (not the
  // socket, unlike applyMove) - same reasoning as resign(): none of these
  // are latency-sensitive, and the room gets notified either way via
  // EventsService regardless of which transport made the request.
  async offerDraw(id: number, userId: string): Promise<ChessGame> {
    const game = await this.getGame(id);
    if (game.status !== 'active') {
      throw new BadRequestException('Game is not active');
    }
    const seat = this.seatFor(game, userId);
    if (!seat) {
      throw new ForbiddenException('You are not a player in this game');
    }
    if (game.drawOfferedBy === seat) {
      return game; // already offered by you - treat as a no-op, not an error
    }

    game.drawOfferedBy = seat;
    const saved = await this.chessGameRepo.save(game);

    this.eventsService.broadcastToRoom(this.roomFor(id), 'chess:draw-offered', {
      gameId: id,
      offeredBy: seat,
    });
    return saved;
  }

  // Requires the OTHER seat's agreement - the offering player calling this
  // on their own offer is rejected below, same as they can't resign on their
  // opponent's behalf.
  async acceptDraw(id: number, userId: string): Promise<ChessGame> {
    const game = await this.getGame(id);
    const seat = this.seatFor(game, userId);
    if (!seat) {
      throw new ForbiddenException('You are not a player in this game');
    }
    if (!game.drawOfferedBy) {
      throw new BadRequestException('No draw offer is pending');
    }
    if (game.drawOfferedBy === seat) {
      throw new BadRequestException('You cannot accept your own draw offer');
    }

    game.status = 'draw';
    game.winner = 'draw';
    game.drawOfferedBy = null;
    game.endedAt = new Date();
    const saved = await this.chessGameRepo.save(game);

    this.eventsService.broadcastToRoom(this.roomFor(id), 'chess:ended', {
      gameId: id,
      status: saved.status,
      winner: saved.winner,
    });
    return saved;
  }

  async declineDraw(id: number, userId: string): Promise<ChessGame> {
    const game = await this.getGame(id);
    const seat = this.seatFor(game, userId);
    if (!seat) {
      throw new ForbiddenException('You are not a player in this game');
    }
    if (!game.drawOfferedBy) {
      throw new BadRequestException('No draw offer is pending');
    }
    if (game.drawOfferedBy === seat) {
      throw new BadRequestException('You cannot decline your own draw offer');
    }

    game.drawOfferedBy = null;
    const saved = await this.chessGameRepo.save(game);

    this.eventsService.broadcastToRoom(this.roomFor(id), 'chess:draw-declined', {
      gameId: id,
    });
    return saved;
  }

  private roomFor(id: number): string {
    return `chess:${id}`;
  }

  private seatFor(game: ChessGame, userId: string): ChessColor | null {
    if (game.whiteUser?.auth0UserId === userId) return 'white';
    if (game.blackUser?.auth0UserId === userId) return 'black';
    return null;
  }

  // Mirrors StreamController.ensureAgoraReady(): a user can hit this
  // endpoint before the Auth0->local User sync job has ever run for them,
  // so the local record is created on demand rather than assumed to exist.
  private async ensureLocalUser(userId: string): Promise<string> {
    let user = await this.userService.findAuth0User(userId);
    if (!user?.auth0UserId) {
      user = await this.userService.createLocalUser(userId, userId);
    }
    return user.auth0UserId;
  }
}
