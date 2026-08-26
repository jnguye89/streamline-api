// chess-timeout-scheduler.service.ts
//
// Auto-resigns whichever player has gone quiet on their own turn for too
// long. This is deliberately a periodic sweep rather than something checked
// on a request (e.g. inside getGame()) - the whole point is to catch games
// where NOBODY is calling the API at all (both players gone, or the one
// player whose turn it is never coming back), so there has to be something
// running on its own schedule rather than piggybacking on user activity.
//
// Configurable via the CHESS_TURN_TIMEOUT_HOURS env var (see
// resolveTimeoutMs below) - follows this codebase's existing convention of
// reading process.env directly (see RDS_HOSTNAME, REDIS_HOST, etc. in
// app.module.ts) rather than going through ConfigService, even though
// @nestjs/config is registered.
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ChessService } from './chess.service';

// How often to sweep for stale turns - independent of the timeout duration
// itself. Five minutes means a timed-out game is caught within 5 minutes of
// crossing the line, which is plenty precise against an hours-long timeout.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Used only if CHESS_TURN_TIMEOUT_HOURS is unset entirely - matches the "6
// hours" example given when this was speced.
const DEFAULT_TIMEOUT_HOURS = 6;

@Injectable()
export class ChessTimeoutSchedulerService {
  private readonly logger = new Logger(ChessTimeoutSchedulerService.name);

  constructor(private readonly chessService: ChessService) {}

  @Interval(CHECK_INTERVAL_MS)
  async checkForAbandonedTurns(): Promise<void> {
    const timeoutMs = this.resolveTimeoutMs();
    if (timeoutMs === null) return; // feature disabled - see resolveTimeoutMs

    const resigned = await this.chessService.autoResignStaleTurns(timeoutMs);
    if (resigned.length) {
      const hours = timeoutMs / (60 * 60 * 1000);
      this.logger.log(
        `Auto-resigned ${resigned.length} game(s) idle past the ${hours}h turn timeout: ` +
          resigned.map((g) => `#${g.id}`).join(', '),
      );
    }
  }

  // CHESS_TURN_TIMEOUT_HOURS unset -> the documented 6-hour default.
  // Set to a positive number -> that many hours.
  // Set to '0' (or any non-positive/non-numeric value) -> feature disabled,
  // for an operator who wants auto-resign off entirely without touching code.
  private resolveTimeoutMs(): number | null {
    const raw = process.env.CHESS_TURN_TIMEOUT_HOURS;
    const hours = raw === undefined ? DEFAULT_TIMEOUT_HOURS : Number(raw);

    if (!Number.isFinite(hours) || hours <= 0) return null;
    return hours * 60 * 60 * 1000;
  }
}
