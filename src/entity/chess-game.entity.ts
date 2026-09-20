import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export type ChessGameStatus =
  | 'waiting'
  | 'active'
  | 'checkmate'
  | 'stalemate'
  | 'draw'
  | 'resigned'
  | 'abandoned'
  | 'timeout';

export type ChessColor = 'white' | 'black';
export type ChessWinner = 'white' | 'black' | 'draw';

// Standard starting position. Applied explicitly in ChessGameRepository.createNew()
// rather than as a @Column default - MySQL doesn't reliably support a literal
// DEFAULT on text/varchar columns under TypeORM's `synchronize`, so every write
// path (repository, not the DB) is responsible for seeding it.
export const CHESS_STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// The built-in Stockfish opponent occupies the black seat of a vs-computer
// game as an ordinary local User row (see ChessService.ensureBotUser), so
// everything that already assumes an active game has two seated users -
// the UI's name display, mySeat checks, eager relations - keeps working
// without special cases. It is never an Auth0 identity: nothing can log in
// as it, and nothing should try to sync it against Auth0.
export const CHESS_BOT_USER_ID = 'bot|stockfish';
export const CHESS_BOT_USERNAME = 'Computer';

@Entity()
export class ChessGame {
  @PrimaryGeneratedColumn()
  id!: number;

  // Creator is always seated as white for v1 - keeps game creation a single
  // step (no color-choice UI) rather than because white is inherently
  // "owned" by the creator.
  @ManyToOne(() => User, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
    eager: true,
    nullable: false,
  })
  @JoinColumn({
    name: 'white_user_id',
    referencedColumnName: 'auth0UserId',
  })
  whiteUser!: User;

  // Nullable until a second player joins the open seat.
  @ManyToOne(() => User, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
    eager: true,
    nullable: true,
  })
  @JoinColumn({
    name: 'black_user_id',
    referencedColumnName: 'auth0UserId',
  })
  blackUser!: User | null;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  status!: ChessGameStatus;

  @Column({ type: 'varchar', length: 100 })
  fen!: string;

  // SAN move history (chess.js .pgn() output). Sufficient for v1 replay /
  // spectator catch-up without a separate per-move table.
  @Column({ type: 'text' })
  pgn!: string;

  @Column({ type: 'varchar', length: 5 })
  turn!: ChessColor;

  // `type` must be explicit here: this column's TS type is a union WITH
  // `| null` (unlike status/turn above, which are non-nullable string
  // unions and happen to reflect to String on their own). TypeORM infers a
  // column's SQL type from emitDecoratorMetadata's `design:type`, and for a
  // `SomeUnion | null` property that metadata collapses to bare `Object`
  // instead of `String` - which mysql's DataTypeNotSupportedError then
  // rejects outright at startup. Left inferred, this is exactly the crash:
  // `Data type "Object" in "ChessGame.winner" is not supported by "mysql"`.
  @Column({ type: 'varchar', length: 5, nullable: true })
  winner!: ChessWinner | null;

  // Which seat currently has a draw offer standing, or null if none. Same
  // "must be explicit `type:`" reasoning as `winner` above applies here too
  // - this is a nullable union (ChessColor | null), which emitDecoratorMetadata
  // would otherwise reflect to bare Object and crash mysql's synchronize.
  // Cleared whenever a move is made (see ChessService.applyMove) - making a
  // move implicitly lapses any standing offer, same as over the board - and
  // whenever the offer is accepted, declined, or the game otherwise ends.
  @Column({ type: 'varchar', length: 5, name: 'draw_offered_by', nullable: true })
  drawOfferedBy!: ChessColor | null;

  // When the CURRENT turn (whoever `turn` says is to move) began - reset on
  // every move (ChessService.applyMove) and the moment the game actually
  // goes active (ChessGameRepository.setBlackUserAndActivate; a 'waiting'
  // game with nobody to play against yet doesn't have a "turn" running).
  // ChessTimeoutSchedulerService compares this against a configurable
  // cutoff to auto-resign whoever's gone quiet - see CHESS_TURN_TIMEOUT_HOURS.
  // Nullable (rather than backfilled) so this rolls out safely onto
  // existing rows: a game already in progress before this column existed
  // simply isn't eligible for auto-timeout until its next move sets it,
  // instead of every in-flight game suddenly reading as maximally stale.
  @Column({ type: 'timestamp', name: 'turn_started_at', nullable: true })
  turnStartedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', name: 'ended_at', nullable: true })
  endedAt!: Date | null;

  // True when the black seat is held by the built-in computer opponent
  // rather than a second human. Set once, by ChessService.playComputer,
  // and never changes for the life of the game. A plain boolean with a
  // DB-level default so `synchronize` can add it onto existing rows (all of
  // which are human-vs-human, i.e. false) without a backfill.
  @Column({ type: 'boolean', name: 'vs_computer', default: false })
  vsComputer!: boolean;
}
