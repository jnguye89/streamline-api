/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await --
   these specs deliberately reach into private members and use minimal fakes */
import { Chess } from 'chess.js';

import { ChessEngineService } from './chess-engine.service';

// Exercises the real Stockfish child process (the npm WASM build), so this
// also guards the UCI plumbing - handshake, serialization, respawn.
describe('ChessEngineService (real engine)', () => {
  let engine: ChessEngineService;

  beforeAll(() => {
    process.env.CHESS_BOT_MOVE_TIME_MS = '100';
    engine = new ChessEngineService();
  });

  afterAll(() => engine.onModuleDestroy());

  it('returns a legal move for the side to move', async () => {
    const chess = new Chess();
    chess.move('e4');

    const move = await engine.bestMove(chess.fen());

    expect(() => chess.move(move)).not.toThrow();
  }, 30_000);

  it('serializes concurrent requests without mixing up answers', async () => {
    const a = new Chess();
    const b = new Chess();
    b.move('d4');

    const [ma, mb] = await Promise.all([
      engine.bestMove(a.fen()),
      engine.bestMove(b.fen()),
    ]);

    expect(() => a.move(ma)).not.toThrow();
    expect(() => b.move(mb)).not.toThrow();
  }, 30_000);

  it('recovers after the process dies', async () => {
    (engine as any).proc.kill();
    await new Promise((r) => setTimeout(r, 200));

    const move = await engine.bestMove(new Chess().fen());

    expect(move.from).toHaveLength(2);
  }, 30_000);
});
