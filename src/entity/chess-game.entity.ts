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
  | 'abandoned';

export type ChessColor = 'white' | 'black';
export type ChessWinner = 'white' | 'black' | 'draw';

// Standard starting position. Applied explicitly in ChessGameRepository.createNew()
// rather than as a @Column default - MySQL doesn't reliably support a literal
// DEFAULT on text/varchar columns under TypeORM's `synchronize`, so every write
// path (repository, not the DB) is responsible for seeding it.
export const CHESS_STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', name: 'ended_at', nullable: true })
  endedAt!: Date | null;
}
