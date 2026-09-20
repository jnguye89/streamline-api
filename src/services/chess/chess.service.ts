import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Chess } from 'chess.js';

import {
  CHESS_BOT_USERNAME,
  CHESS_BOT_USER_ID,
  ChessColor,
  ChessGame,
} from 'src/entity/chess-game.entity';
import { ChessGameRepository } from 'src/repositories/chess-game.repository';
import { EventsService } from 'src/services/events/events.service';
import { UserService } from 'src/services/user.service';
import { ChessEngineService, EngineMove } from './chess-engine.service';

export interface ChessMoveResult {
  game: ChessGame;
  from: string;
  to: string;
  san: string;
}

// The computer "thinks" for a beat beyond the engine's own search time so
// replies don't land instantly, which reads as robotic and makes a quick
// capture sequence hard to follow on screen.
const BOT_REPLY_MIN_DELAY_MS = 600;
const BOT_REPLY_JITTER_MS = 800;
// How long the computer sits on a draw offer before declining it, so the
// human sees "Draw offer sent…" first and then the "Draw declined." message
// rather than the two collapsing into one frame.
const BOT_DRAW_RESPONSE_DELAY_MS = 1000;

@Injectable()
export class ChessService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChessService.name);

  // Games with a computer reply already scheduled or in flight, so a second
  // trigger (e.g. the stale-turn sweep firing while the engine is still
  // thinking) can't queue a duplicate move. In-memory on purpose: it only
  // needs to be right for this process, and the reply itself re-checks the
  // game's real state before moving.
  private readonly pendingComputerMoves = new Set<number>();

  constructor(
    private readonly chessGameRepo: ChessGameRepository,
    private readonly userService: UserService,
    private readonly eventsService: EventsService,
    private readonly engine: ChessEngineService,
  ) {}

  // A computer reply that was pending in memory dies with the process, and
  // nothing else would ever prompt it again (the human is waiting on the
  // board, not calling the API). Pick those games back up on boot.
  async onApplicationBootstrap(): Promise<void> {
    try {
      const awaiting =
        await this.chessGameRepo.findActiveComputerGamesAwaitingBot();
      awaiting.forEach((g) => this.scheduleComputerMove(g.id));
      if (awaiting.length) {
        this.logger.log(
          `Resuming ${awaiting.length} vs-computer game(s) awaiting a reply`,
        );
      }
    } catch (err) {
      this.logger.error(
        'Could not resume vs-computer games on boot',
        err as Error,
      );
    }
  }

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
      vsComputer: saved.vsComputer,
    });
    this.notifyTurn(saved);
    return saved;
  }

  // Creator-only alternative to waiting for a human: seats the built-in
  // computer as black and starts the game. The human is always white for
  // v1, so the computer never has to open - the first reply is triggered by
  // the human's first move (see applyMove).
  async playComputer(id: number, userId: string): Promise<ChessGame> {
    const game = await this.getGame(id);
    if (game.whiteUser.auth0UserId !== userId) {
      throw new ForbiddenException(
        'Only the player who started this game can play the computer',
      );
    }
    if (game.status !== 'waiting') {
      throw new BadRequestException('This game is not waiting for an opponent');
    }

    const botId = await this.ensureBotUser();
    await this.chessGameRepo.setBlackUserAndActivate(id, botId, true);
    const saved = await this.getGame(id);

    // Same event a human join sends, so the creator's board (and anyone
    // spectating the room) flips from "waiting" to active with no new
    // client listener. No notifyTurn: the creator is looking right at it.
    this.eventsService.broadcastToRoom(this.roomFor(id), 'chess:joined', {
      gameId: id,
      blackUser: saved.blackUser,
      status: saved.status,
      turn: saved.turn,
      vsComputer: saved.vsComputer,
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

    const result = await this.executeMove(game, seat, from, to, promotion);
    if (
      result.game.vsComputer &&
      result.game.status === 'active' &&
      result.game.turn === 'black'
    ) {
      this.scheduleComputerMove(id);
    }
    return result;
  }

  // Everything that happens once a move is known to be from the right seat
  // on their own turn: chess.js validation against the stored fen, persist,
  // broadcast. Shared by human moves (applyMove) and the computer's reply
  // (playComputerMove) so both go through the exact same authority.
  private async executeMove(
    game: ChessGame,
    seat: ChessColor,
    from: string,
    to: string,
    promotion?: string,
  ): Promise<ChessMoveResult> {
    const id = game.id;
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
    this.notifyTurn(saved);
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
      // A computer that's "gone quiet" isn't a player who walked away - its
      // reply was lost (restart, engine failure). Retry the move instead of
      // handing the human a win they didn't earn.
      if (game.vsComputer && game.turn === 'black') {
        this.scheduleComputerMove(game.id);
        continue;
      }

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
    if (saved.vsComputer) {
      this.scheduleComputerDrawDecline(id);
    }
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

  // Personal "it's your turn" nudge - separate from the chess:move/
  // chess:joined room broadcasts above, and sent via EventsService.notifyUser
  // (the whoever's-turn-it-is player's own `user:{id}` room) rather than
  // the room broadcast, so it reaches that player wherever they are in the
  // app, not just while they happen to have this exact game's chess:{id}
  // room joined. No-ops for a game that just ended (nobody's "turn" is
  // meaningful once it's checkmate/stalemate/draw/resigned/etc.).
  private notifyTurn(game: ChessGame): void {
    if (game.status !== 'active') return;
    const toMove = game.turn === 'white' ? game.whiteUser : game.blackUser;
    if (!toMove) return;
    // Nobody to nudge - the computer replies on its own.
    if (toMove.auth0UserId === CHESS_BOT_USER_ID) return;
    const opponent = game.turn === 'white' ? game.blackUser : game.whiteUser;

    this.eventsService.notifyUser(toMove.auth0UserId, 'chess:your-turn', {
      gameId: game.id,
      opponentUsername: opponent?.username ?? null,
      // The side to move is the only side that can be in check, so if the
      // position is a check it's the recipient who's in it.
      inCheck: new Chess(game.fen).isCheck(),
    });
  }

  private scheduleComputerMove(id: number): void {
    if (this.pendingComputerMoves.has(id)) return;
    this.pendingComputerMoves.add(id);

    const delay =
      BOT_REPLY_MIN_DELAY_MS + Math.floor(Math.random() * BOT_REPLY_JITTER_MS);
    setTimeout(() => {
      this.playComputerMove(id)
        .catch((err: unknown) =>
          this.logger.error(
            `Computer reply failed for game #${id}`,
            err instanceof Error ? err.stack : String(err),
          ),
        )
        .finally(() => this.pendingComputerMoves.delete(id));
    }, delay);
  }

  private async playComputerMove(id: number): Promise<void> {
    const game = await this.chessGameRepo.findById(id);
    if (!this.computerToMove(game)) return;

    let choice: EngineMove | null;
    try {
      choice = await this.engine.bestMove(game.fen);
    } catch (err) {
      // A stalled game is worse than a weak move: fall back to any legal
      // move so the human is never left staring at a board that won't
      // answer.
      this.logger.warn(
        `Engine failed for game #${id} (${err instanceof Error ? err.message : err}); playing a random legal move`,
      );
      choice = this.randomLegalMove(game.fen);
    }
    if (!choice) return;

    // The engine takes a moment; the human may have resigned (or the game
    // may have been ended by a sweep) while it thought. Re-read and make
    // sure the position is still the one we searched.
    const fresh = await this.chessGameRepo.findById(id);
    if (!this.computerToMove(fresh) || fresh.fen !== game.fen) return;

    const result = await this.executeMove(
      fresh,
      'black',
      choice.from,
      choice.to,
      choice.promotion,
    );
    this.logger.log(`chess move game=${id} ${result.san} by computer`);
  }

  private computerToMove(game: ChessGame | null): game is ChessGame {
    return (
      !!game &&
      game.status === 'active' &&
      game.vsComputer &&
      game.turn === 'black'
    );
  }

  private randomLegalMove(fen: string): EngineMove | null {
    const moves = new Chess(fen).moves({ verbose: true });
    if (!moves.length) return null;
    const m = moves[Math.floor(Math.random() * moves.length)];
    return { from: m.from, to: m.to, promotion: m.promotion };
  }

  // The computer always declines: offering a draw is how a human asks for a
  // half point they haven't earned, and a fixed-strength bot has no honest
  // basis to accept one. Sent as the normal draw-declined event so the UI's
  // existing "Draw declined." handling covers it.
  private scheduleComputerDrawDecline(id: number): void {
    setTimeout(() => {
      this.declineComputerDraw(id).catch((err: unknown) =>
        this.logger.error(
          `Computer draw response failed for game #${id}`,
          err instanceof Error ? err.stack : String(err),
        ),
      );
    }, BOT_DRAW_RESPONSE_DELAY_MS);
  }

  private async declineComputerDraw(id: number): Promise<void> {
    const game = await this.chessGameRepo.findById(id);
    if (
      !game ||
      game.status !== 'active' ||
      !game.vsComputer ||
      game.drawOfferedBy !== 'white'
    ) {
      return; // moved on (a move lapses the offer) or the game ended
    }
    game.drawOfferedBy = null;
    await this.chessGameRepo.save(game);
    this.eventsService.broadcastToRoom(
      this.roomFor(id),
      'chess:draw-declined',
      { gameId: id },
    );
  }

  // The computer is an ordinary local User row (never an Auth0 identity),
  // created on first use - same on-demand approach as ensureLocalUser.
  private async ensureBotUser(): Promise<string> {
    let bot = await this.userService.findAuth0User(CHESS_BOT_USER_ID);
    if (!bot?.auth0UserId) {
      bot = await this.userService.createLocalUser(
        CHESS_BOT_USER_ID,
        CHESS_BOT_USERNAME,
      );
    }
    return bot.auth0UserId;
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
