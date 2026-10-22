import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { appError } from '../common/errors';
import { EMOTES } from './emotes';
import { CallBillingService } from './call-billing.service';
import { GAMES, SocialService } from './social.service';

class CallDto { @IsUUID() userId!: string; @IsOptional() @IsIn(['voice', 'video']) mode?: 'voice' | 'video' }
class ModeDto { @IsOptional() @IsIn(['voice', 'video']) mode?: 'voice' | 'video' }
class AnswerDto { @IsBoolean() accept!: boolean }

@Controller()
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly social: SocialService, private readonly billing: CallBillingService) {}

  @Get('players/:id')
  profile(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.social.profile(u.id, id); }

  @Get('leaderboard')
  leaderboard(@CurrentUser() u: AuthUser, @Query('period') period = 'week', @Query('game') game?: string) {
    if (period !== 'week' && period !== 'all') throw appError(400, 'BAD_PERIOD', 'period must be week or all');
    if (game && !(GAMES as readonly string[]).includes(game)) throw appError(400, 'BAD_GAME', 'Unknown game');
    return this.social.leaderboard(u.id, period, game);
  }

  @Get('online')
  online() { return this.social.onlineCount(); }

  @Get('emotes')
  emotes() { return { emotes: EMOTES }; }

  @Post('social/rematch/:matchId') @HttpCode(200)
  rematch(@CurrentUser() u: AuthUser, @Param('matchId', ParseUUIDPipe) id: string) { return this.social.rematch(u.id, id); }

  @Post('voice/room') @HttpCode(200)
  roomVoice(@CurrentUser() u: AuthUser, @Body() dto: ModeDto) { return this.social.roomVoice(u.id, dto.mode); }

  @Get('voice/pricing')
  pricing() { return this.billing.pricing(); }

  @Post('voice/sessions/:id/renew') @HttpCode(200)
  renew(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.billing.renew(u.id, id); }

  @Post('voice/sessions/:id/end') @HttpCode(200)
  endSession(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.billing.end(id, u.id); }

  @Post('voice/calls') @HttpCode(200)
  call(@CurrentUser() u: AuthUser, @Body() dto: CallDto) { return this.social.startCall(u.id, dto.userId, dto.mode); }

  @Post('voice/calls/:id/answer') @HttpCode(200)
  answer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswerDto) { return this.social.answerCall(u.id, id, dto.accept); }

  @Post('voice/calls/:id/end') @HttpCode(200)
  end(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.social.endCall(u.id, id); }
}
