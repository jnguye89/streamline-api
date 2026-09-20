import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';

import { Public } from 'src/auth/public.decorator';
import { User } from 'src/auth/user.decorator';
import { UserDto } from 'src/dto/user.dto';
import { ChessGame } from 'src/entity/chess-game.entity';
import { ChessService } from 'src/services/chess/chess.service';

// Mirrors StreamController's split: listing/reading a game is public (an
// anonymous viewer can spectate, same as a live stream), while every
// mutating action requires the global JwtAuthGuard (no @Public()) - playing
// chess requires login, spectating doesn't.
@Controller('chess')
export class ChessController {
  constructor(private readonly chessService: ChessService) {}

  @Get()
  @Public()
  async listGames(): Promise<ChessGame[]> {
    return this.chessService.listOpenGames();
  }

  @Get(':id')
  @Public()
  async getGame(@Param('id', ParseIntPipe) id: number): Promise<ChessGame> {
    return this.chessService.getGame(id);
  }

  @Post()
  async createGame(@User() user: UserDto): Promise<ChessGame> {
    return this.chessService.createGame(user.userId);
  }

  @Post(':id/join')
  async joinGame(
    @Param('id', ParseIntPipe) id: number,
    @User() user: UserDto,
  ): Promise<ChessGame> {
    return this.chessService.joinGame(id, user.userId);
  }

  // Creator-only: fills the open black seat with the built-in computer
  // opponent instead of waiting for a second human. Requires auth like every
  // other mutating chess route (no @Public()).
  @Post(':id/computer')
  async playComputer(
    @Param('id', ParseIntPipe) id: number,
    @User() user: UserDto,
  ): Promise<ChessGame> {
    return this.chessService.playComputer(id, user.userId);
  }

  @Post(':id/resign')
  async resign(
    @Param('id', ParseIntPipe) id: number,
    @User() user: UserDto,
  ): Promise<ChessGame> {
    return this.chessService.resign(id, user.userId);
  }

  @Post(':id/draw/offer')
  async offerDraw(
    @Param('id', ParseIntPipe) id: number,
    @User() user: UserDto,
  ): Promise<ChessGame> {
    return this.chessService.offerDraw(id, user.userId);
  }

  @Post(':id/draw/accept')
  async acceptDraw(
    @Param('id', ParseIntPipe) id: number,
    @User() user: UserDto,
  ): Promise<ChessGame> {
    return this.chessService.acceptDraw(id, user.userId);
  }

  @Post(':id/draw/decline')
  async declineDraw(
    @Param('id', ParseIntPipe) id: number,
    @User() user: UserDto,
  ): Promise<ChessGame> {
    return this.chessService.declineDraw(id, user.userId);
  }
}
