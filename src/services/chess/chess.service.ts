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

  async createGame(userId: string): Promise<ChessGame> {
    const whiteUserId = await this.ensureLocalUser(userId);
    return this.chessGameRepo.createNew(whiteUserId);
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

    game.endedAt = new Date();
    const saved = await this.chessGameRepo.save(game);

    this.eventsService.broadcastToRoom(this.roomFor(id), 'chess:ended', {
      gameId: id,
      status: saved.status,
      winner: saved.winner,
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
