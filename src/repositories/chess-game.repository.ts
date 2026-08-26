import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CHESS_STARTING_FEN, ChessGame } from 'src/entity/chess-game.entity';

@Injectable()
export class ChessGameRepository {
  constructor(
    @InjectRepository(ChessGame)
    private readonly chessGameRepo: Repository<ChessGame>,
  ) {}

  async findOpen(): Promise<ChessGame[]> {
    return this.chessGameRepo
      .createQueryBuilder('g')
      // whiteUser/blackUser are `eager: true` on the entity, but eager
      // relations only auto-join through the find()/findOne() Find Options
      // API (see findById below) - TypeORM's QueryBuilder never applies
      // them implicitly, so without these explicit joins every game here
      // comes back with whiteUser/blackUser undefined. That silently broke
      // the watch feed's seated-player check (WatchComponent.canPlayChess /
      // ChessGameComponent.mySeat both compare against
      // game.whiteUser?.auth0UserId), since this is what powers
      // ChessService.listOpenGames() -> GET /chess -> the frontend's
      // currentItem for a game in the feed.
      .leftJoinAndSelect('g.whiteUser', 'whiteUser')
      .leftJoinAndSelect('g.blackUser', 'blackUser')
      .where('g.status IN (:...statuses)', {
        statuses: ['waiting', 'active'],
      })
      .orderBy('g.createdAt', 'DESC')
      .getMany();
  }

  async findById(id: number): Promise<ChessGame | null> {
    return this.chessGameRepo.findOne({ where: { id } });
  }

  async createNew(whiteUserId: string): Promise<ChessGame> {
    // Passed straight into create()/save() rather than built up on a typed
    // ChessGame instance: TypeORM's DeepPartial<ChessGame> makes a bare
    // `{ auth0UserId }` acceptable for the `whiteUser` relation here, where
    // assigning that same partial object to an already-hydrated entity's
    // `.whiteUser` property would fail - `User` requires its full shape
    // (agoraUserId, username, threads, stream, streams, ...) for a direct
    // property assignment, DeepPartial only relaxes that for create()/save().
    const game = this.chessGameRepo.create({
      whiteUser: { auth0UserId: whiteUserId },
      blackUser: null,
      status: 'waiting',
      fen: CHESS_STARTING_FEN,
      pgn: '',
      turn: 'white',
      winner: null,
      drawOfferedBy: null,
      // Null, not "now" - nobody's turn is actually running while the game
      // is still 'waiting' for a second player. Set for real the moment it
      // goes active, in setBlackUserAndActivate below.
      turnStartedAt: null,
      endedAt: null,
    });
    return this.chessGameRepo.save(game);
  }

  // Same DeepPartial reasoning as createNew() above - this goes through
  // save() with a bare partial object instead of mutating a loaded
  // ChessGame's `.blackUser` relation property directly, which is why this
  // is a repository method rather than inline in ChessService.joinGame.
  async setBlackUserAndActivate(id: number, blackUserId: string): Promise<void> {
    await this.chessGameRepo.save({
      id,
      blackUser: { auth0UserId: blackUserId },
      status: 'active',
      turnStartedAt: new Date(),
    });
  }

  async save(game: ChessGame): Promise<ChessGame> {
    return this.chessGameRepo.save(game);
  }

  // Active games where the side to move has gone quiet longer than `cutoff`
  // allows - fed a computed `now - timeoutMs` cutoff by
  // ChessTimeoutSchedulerService rather than taking a raw duration here, so
  // this stays a plain, easily-testable point-in-time query.
  async findStaleActiveGames(cutoff: Date): Promise<ChessGame[]> {
    return this.chessGameRepo
      .createQueryBuilder('g')
      // Same QueryBuilder-doesn't-honor-`eager: true` gap as findOpen()
      // above - joined explicitly so whiteUser/blackUser are actually
      // populated on whatever autoResignStaleTurns() does with these.
      .leftJoinAndSelect('g.whiteUser', 'whiteUser')
      .leftJoinAndSelect('g.blackUser', 'blackUser')
      .where('g.status = :status', { status: 'active' })
      .andWhere('g.turnStartedAt IS NOT NULL')
      .andWhere('g.turnStartedAt < :cutoff', { cutoff })
      .getMany();
  }
}
