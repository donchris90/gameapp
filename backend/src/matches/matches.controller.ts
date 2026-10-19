import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, Min } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchesService } from './matches.service';

class MoveDto {
  /** The version of the match the player was looking at. */
  @IsInt() @Min(1) version!: number;
  @IsObject() move!: Record<string, unknown>;
}

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Get('current')
  current(@CurrentUser() u: AuthUser) { return this.matches.current(u.id); }

  @Get('history')
  history(
    @CurrentUser() u: AuthUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.matches.history(u.id, { limit: Math.min(Math.max(limit, 1), 50), cursor });
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.matches.get(u.id, id); }

  @Post(':id/move') @HttpCode(200)
  move(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveDto) {
    return this.matches.move(u.id, id, dto);
  }

  @Post(':id/forfeit') @HttpCode(200)
  forfeit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.matches.forfeit(u.id, id); }
}
