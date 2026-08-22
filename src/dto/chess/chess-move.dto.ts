import { IsIn, IsInt, IsOptional, IsString, Matches } from 'class-validator';

const SQUARE_PATTERN = /^[a-h][1-8]$/;

export class ChessMoveDto {
  @IsInt()
  gameId!: number;

  @IsString()
  @Matches(SQUARE_PATTERN)
  from!: string;

  @IsString()
  @Matches(SQUARE_PATTERN)
  to!: string;

  // v1 always auto-promotes to queen client-side, but the field is accepted
  // here so under-promotion can be added later without a protocol change.
  @IsOptional()
  @IsIn(['q', 'r', 'b', 'n'])
  promotion?: string;
}
