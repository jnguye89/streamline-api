/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await --
   these specs deliberately reach into private members and use minimal fakes */
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import {
  CHESS_BOT_USER_ID,
  CHESS_STARTING_FEN,
  ChessGame,
} from 'src/entity/chess-game.entity';
import { ChessService } from './chess.service';

const HUMAN = 'auth0|human';

function makeGame(overrides: Partial<ChessGame> = {}): ChessGame {
  return {
    id: 1,
    whiteUser: { auth0UserId: HUMAN, username: 'human' },
    blackUser: null,
    status: 'waiting',
    fen: CHESS_STARTING_FEN,
    pgn: '',
    turn: 'white',
    winner: null,
    drawOfferedBy: null,
    turnStartedAt: null,
    endedAt: null,
    vsComputer: false,
    ...overrides,
  } as unknown as ChessGame;
}

// A tiny in-memory stand-in for ChessGameRepository holding one game, so the
// service's real read-modify-write flow runs end to end.
function setup(initial: ChessGame) {
  const game = initial;
  const repo = {
    findById: jest.fn(async () => game),
    save: jest.fn(async (g: ChessGame) => Object.assign(game, g)),
    setBlackUserAndActivate: jest.fn(
      async (_id: number, blackId: string, vsComputer = false) => {
        Object.assign(game, {
          blackUser: { auth0UserId: blackId, username: 'Computer' },
          status: 'active',
          vsComputer,
          turnStartedAt: new Date(),
        });
      },
    ),
    findActiveComputerGamesAwaitingBot: jest.fn(async () => []),
  };
  const userService = {
    findAuth0User: jest.fn(async () => null),
    createLocalUser: jest.fn(async (id: string, username: string) => ({
      auth0UserId: id,
      username,
    })),
  };
  const events = { broadcastToRoom: jest.fn(), notifyUser: jest.fn() };
  const engine = { bestMove: jest.fn() };

  const service = new ChessService(
    repo as never,
    userService as never,
    events as never,
    engine as never,
  );
  return { service, game, repo, userService, events, engine };
}

describe('ChessService vs computer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('playComputer', () => {
    it('seats the bot as black, activates the game, and tells the room', async () => {
      const { service, events, userService } = setup(makeGame());

      const result = await service.playComputer(1, HUMAN);

      expect(userService.createLocalUser).toHaveBeenCalledWith(
        CHESS_BOT_USER_ID,
        'Computer',
      );
      expect(result.status).toBe('active');
      expect(result.vsComputer).toBe(true);
      expect(result.blackUser?.auth0UserId).toBe(CHESS_BOT_USER_ID);
      expect(events.broadcastToRoom).toHaveBeenCalledWith(
        'chess:1',
        'chess:joined',
        expect.objectContaining({ vsComputer: true, status: 'active' }),
      );
    });

    it('only lets the creator start it', async () => {
      const { service } = setup(makeGame());
      await expect(service.playComputer(1, 'auth0|stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('only works while the game is still waiting', async () => {
      const { service } = setup(makeGame({ status: 'active' }));
      await expect(service.playComputer(1, HUMAN)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('computer reply', () => {
    it('answers a human move exactly once, as black', async () => {
      const { service, game, engine, events } = setup(makeGame());
      engine.bestMove.mockResolvedValue({ from: 'e7', to: 'e5' });
      await service.playComputer(1, HUMAN);

      await service.applyMove(1, HUMAN, 'e2', 'e4');
      expect(game.turn).toBe('black');
      expect(engine.bestMove).not.toHaveBeenCalled(); // not instant

      await jest.runAllTimersAsync();

      expect(engine.bestMove).toHaveBeenCalledTimes(1);
      expect(game.turn).toBe('white');
      expect(game.pgn).toContain('e5');
      expect(events.broadcastToRoom).toHaveBeenCalledWith(
        'chess:1',
        'chess:move',
        expect.objectContaining({ from: 'e7', to: 'e5', turn: 'white' }),
      );
    });

    it('does not double-schedule while a reply is already pending', async () => {
      const { service, engine } = setup(makeGame());
      engine.bestMove.mockResolvedValue({ from: 'e7', to: 'e5' });
      await service.playComputer(1, HUMAN);
      await service.applyMove(1, HUMAN, 'e2', 'e4');

      // A sweep re-triggering the same game mid-flight.
      (service as any).scheduleComputerMove(1);
      await jest.runAllTimersAsync();

      expect(engine.bestMove).toHaveBeenCalledTimes(1);
    });

    it('falls back to a random legal move if the engine fails', async () => {
      const { service, game, engine } = setup(makeGame());
      engine.bestMove.mockRejectedValue(new Error('engine down'));
      await service.playComputer(1, HUMAN);
      await service.applyMove(1, HUMAN, 'e2', 'e4');

      await jest.runAllTimersAsync();

      expect(game.turn).toBe('white'); // the bot still moved
    });

    it('does not move if the human resigned while it was thinking', async () => {
      const { service, game, engine } = setup(makeGame());
      engine.bestMove.mockImplementation(async () => {
        await service.resign(1, HUMAN); // resign lands mid-search
        return { from: 'e7', to: 'e5' };
      });
      await service.playComputer(1, HUMAN);
      await service.applyMove(1, HUMAN, 'e2', 'e4');

      await jest.runAllTimersAsync();

      expect(game.status).toBe('resigned');
      expect(game.turn).toBe('black'); // no move applied after the game ended
    });

    it('never sends a your-turn notification to the bot', async () => {
      const { service, engine, events } = setup(makeGame());
      engine.bestMove.mockResolvedValue({ from: 'e7', to: 'e5' });
      await service.playComputer(1, HUMAN);
      await service.applyMove(1, HUMAN, 'e2', 'e4');
      await jest.runAllTimersAsync();

      const targets = events.notifyUser.mock.calls.map((c) => c[0]);
      expect(targets).not.toContain(CHESS_BOT_USER_ID);
      expect(targets).toContain(HUMAN); // the human's turn after the reply
    });
  });

  describe('check notifications', () => {
    it('flags inCheck on the your-turn nudge when a move gives check', async () => {
      // Black has pushed f7-f6, so white's Qd1-h5 is check.
      const { service, events } = setup(
        makeGame({
          status: 'active',
          blackUser: { auth0UserId: 'auth0|other', username: 'other' } as never,
          fen: 'rnbqkbnr/pppp2pp/5p2/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3',
        }),
      );

      await service.applyMove(1, HUMAN, 'd1', 'h5');

      expect(events.notifyUser).toHaveBeenCalledWith(
        'auth0|other',
        'chess:your-turn',
        expect.objectContaining({ inCheck: true }),
      );
    });

    it('does not flag inCheck on an ordinary move', async () => {
      const { service, events } = setup(
        makeGame({
          status: 'active',
          blackUser: { auth0UserId: 'auth0|other', username: 'other' } as never,
        }),
      );

      await service.applyMove(1, HUMAN, 'e2', 'e4');

      expect(events.notifyUser).toHaveBeenCalledWith(
        'auth0|other',
        'chess:your-turn',
        expect.objectContaining({ inCheck: false }),
      );
    });
  });

  describe('draw offers', () => {
    it('are declined by the computer', async () => {
      const { service, game, events } = setup(makeGame());
      await service.playComputer(1, HUMAN);

      await service.offerDraw(1, HUMAN);
      expect(game.drawOfferedBy).toBe('white');

      await jest.runAllTimersAsync();

      expect(game.drawOfferedBy).toBeNull();
      expect(game.status).toBe('active');
      expect(events.broadcastToRoom).toHaveBeenCalledWith(
        'chess:1',
        'chess:draw-declined',
        { gameId: 1 },
      );
    });
  });

  describe('stale-turn sweep', () => {
    it('retries a lost computer reply instead of timing the bot out', async () => {
      const { service, game, engine, repo } = setup(makeGame());
      engine.bestMove.mockResolvedValue({ from: 'e7', to: 'e5' });
      await service.playComputer(1, HUMAN);
      Object.assign(game, {
        turn: 'black',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      });
      (repo as any).findStaleActiveGames = jest.fn();
      const chessGameRepo = (service as any).chessGameRepo;
      chessGameRepo.findStaleActiveGames = jest.fn(async () => [game]);

      const resigned = await service.autoResignStaleTurns(1000);
      await jest.runAllTimersAsync();

      expect(resigned).toHaveLength(0);
      expect(game.status).toBe('active');
      expect(game.turn).toBe('white');
    });
  });
});
