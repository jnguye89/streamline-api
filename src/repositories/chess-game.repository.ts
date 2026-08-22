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
    });
  }

  async save(game: ChessGame): Promise<ChessGame> {
    return this.chessGameRepo.save(game);
  }
}
