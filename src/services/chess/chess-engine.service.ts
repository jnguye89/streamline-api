// chess-engine.service.ts
//
// Thin UCI wrapper around Stockfish, used to pick the computer opponent's
// moves (see ChessService.playComputerMove). Stockfish runs as a child
// process - never inside the API's own event loop - and is spoken to over
// stdin/stdout using the plain-text UCI protocol.
//
// Which engine: by default the `stockfish` npm package's "lite, single
// threaded" WASM build, run under this same Node binary. That has no system
// dependency (works identically on a dev Mac and in the node:alpine image)
// and is still far stronger than a human at full strength - we deliberately
// throttle it below. To use a native binary instead (faster, e.g.
// `apk add stockfish` in the Dockerfile), set STOCKFISH_PATH to it.
//
// Difficulty is fixed for v1 and set via env, following this codebase's
// convention of reading process.env directly (see the timeout scheduler):
//   CHESS_BOT_SKILL_LEVEL    0-20, Stockfish's own "Skill Level" (default 8)
//   CHESS_BOT_MOVE_TIME_MS   think time per move in ms (default 400)
//
// One engine process serves every game. Requests are serialized through a
// promise queue - UCI is a single conversation - and a crashed or wedged
// process is killed and lazily respawned on the next request.
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

export interface EngineMove {
  from: string;
  to: string;
  promotion?: string;
}

const DEFAULT_SKILL_LEVEL = 8;
const DEFAULT_MOVE_TIME_MS = 400;
// Startup (WASM compile + uci handshake) can be slow on a cold small box.
const STARTUP_TIMEOUT_MS = 15_000;
// Slack on top of the think time before we give up on a `go` and let the
// caller fall back to a random legal move.
const MOVE_TIMEOUT_SLACK_MS = 5_000;

@Injectable()
export class ChessEngineService implements OnModuleDestroy {
  private readonly logger = new Logger(ChessEngineService.name);

  private proc: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<void> | null = null;
  private stdoutBuffer = '';
  private lineListener: ((line: string) => void) | null = null;
  // Tail of the serialized request chain - see enqueue().
  private queue: Promise<unknown> = Promise.resolve();

  onModuleDestroy(): void {
    this.killEngine();
  }

  /** Best move for the side to move in `fen`. Rejects if the engine fails. */
  bestMove(fen: string): Promise<EngineMove> {
    return this.enqueue(async () => {
      await this.ensureStarted();
      const moveTimeMs = this.moveTimeMs();

      this.send(`position fen ${fen}`);
      this.send(`go movetime ${moveTimeMs}`);
      const line = await this.waitForLine(
        (l) => l.startsWith('bestmove'),
        moveTimeMs + MOVE_TIMEOUT_SLACK_MS,
      );

      // "bestmove e2e4 ponder e7e5" - or "bestmove (none)" when there's no
      // legal move (the game is already over, which callers shouldn't ask).
      const token = line.split(/\s+/)[1];
      if (!token || token === '(none)' || token.length < 4) {
        throw new Error(`Engine returned no move: "${line}"`);
      }
      return {
        from: token.slice(0, 2),
        to: token.slice(2, 4),
        promotion: token.length > 4 ? token[4] : undefined,
      };
    }).catch((err: unknown) => {
      // A wedged/dead engine must not poison every later request: drop it
      // and let the next call spawn a fresh one.
      this.killEngine();
      throw err;
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    // Keep the chain alive regardless of this task's outcome.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private ensureStarted(): Promise<void> {
    if (this.proc && !this.starting) return Promise.resolve();
    if (!this.starting) {
      this.starting = this.startEngine().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  private async startEngine(): Promise<void> {
    const nativePath = process.env.STOCKFISH_PATH;
    const proc = nativePath
      ? spawn(nativePath, [], { stdio: 'pipe' })
      : spawn(
          process.execPath,
          [require.resolve('stockfish/bin/stockfish-19-lite-single.js')],
          { stdio: 'pipe' },
        );

    this.proc = proc;
    this.stdoutBuffer = '';

    proc.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk));
    // Engines chatter on stderr occasionally; not an error by itself.
    proc.stderr.on('data', (chunk: Buffer) =>
      this.logger.debug(`stderr: ${chunk.toString().trim()}`),
    );
    proc.on('error', (err) => {
      this.logger.error(`Engine process error: ${err.message}`);
      if (this.proc === proc) this.proc = null;
    });
    proc.on('exit', (code) => {
      this.logger.warn(`Engine process exited (code ${code ?? 'null'})`);
      if (this.proc === proc) this.proc = null;
    });

    this.send('uci');
    await this.waitForLine((l) => l === 'uciok', STARTUP_TIMEOUT_MS);
    this.send(`setoption name Skill Level value ${this.skillLevel()}`);
    this.send('isready');
    await this.waitForLine((l) => l === 'readyok', STARTUP_TIMEOUT_MS);
    this.logger.log(
      `Chess engine ready (skill ${this.skillLevel()}, ${this.moveTimeMs()}ms/move)`,
    );
  }

  private onStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString();
    let newline: number;
    while ((newline = this.stdoutBuffer.indexOf('\n')) >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.lineListener?.(line);
    }
  }

  private send(command: string): void {
    if (!this.proc?.stdin.writable) {
      throw new Error('Engine is not running');
    }
    this.proc.stdin.write(`${command}\n`);
  }

  // Resolves with the first stdout line matching `predicate`. Only one wait
  // is ever in flight at a time (requests are serialized above).
  private waitForLine(
    predicate: (line: string) => boolean,
    timeoutMs: number,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineListener = null;
        reject(new Error(`Engine timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.lineListener = (line) => {
        if (!predicate(line)) return;
        clearTimeout(timer);
        this.lineListener = null;
        resolve(line);
      };
    });
  }

  private killEngine(): void {
    const proc = this.proc;
    this.proc = null;
    this.lineListener = null;
    if (proc && !proc.killed) {
      try {
        proc.stdin.write('quit\n');
      } catch {
        // already gone
      }
      proc.kill();
    }
  }

  private skillLevel(): number {
    const n = Number(process.env.CHESS_BOT_SKILL_LEVEL);
    return process.env.CHESS_BOT_SKILL_LEVEL !== undefined && Number.isFinite(n)
      ? Math.min(20, Math.max(0, Math.round(n)))
      : DEFAULT_SKILL_LEVEL;
  }

  private moveTimeMs(): number {
    const n = Number(process.env.CHESS_BOT_MOVE_TIME_MS);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_MOVE_TIME_MS;
  }
}
