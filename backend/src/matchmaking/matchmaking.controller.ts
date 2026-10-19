import { Body, Controller, Delete, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { GameType } from '../generated/prisma/client';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchmakingService } from './matchmaking.service';

class QueueDto {
  @IsEnum(GameType) game!: GameType;
  @IsInt() @Min(0) @Max(1_000_000) stake!: number;
  @IsOptional() @IsInt() @Min(2) @Max(4) size?: number;
}

@Controller('matchmaking')
@UseGuards(JwtAuthGuard)
export class MatchmakingController {
  constructor(private readonly mm: MatchmakingService) {}

  @Post('queue') @HttpCode(200)
  join(@CurrentUser() u: AuthUser, @Body() dto: QueueDto) { return this.mm.join(u.id, dto); }

  @Delete('queue')
  leave(@CurrentUser() u: AuthUser) { return this.mm.leave(u.id); }
}
