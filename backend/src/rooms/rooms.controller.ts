import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { GameType } from '../generated/prisma/client';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { appError } from '../common/errors';
import { RoomsService } from './rooms.service';

class CreateRoomDto {
  @IsEnum(GameType) game!: GameType;
  @IsInt() @Min(0) @Max(1_000_000) stake!: number;
  @IsOptional() @IsInt() @Min(2) @Max(4) maxPlayers?: number;
}
class JoinDto { @IsString() @Matches(/^[A-Za-z0-9]{6}$/, { message: 'code must be 6 letters or numbers' }) code!: string; }
class ReadyDto { @IsBoolean() ready!: boolean; }
class InviteDto { @IsUUID() userId!: string; }

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateRoomDto) { return this.rooms.create(u.id, dto); }

  @Post('join') @HttpCode(200)
  join(@CurrentUser() u: AuthUser, @Body() dto: JoinDto) { return this.rooms.joinByCode(u.id, dto.code); }

  @Get('current')
  async current(@CurrentUser() u: AuthUser) {
    const room = await this.rooms.current(u.id);
    if (!room) throw appError(404, 'NOT_IN_ROOM', 'You are not in a room');
    return room;
  }

  @Post('current/leave') @HttpCode(200) leave(@CurrentUser() u: AuthUser) { return this.rooms.leave(u.id); }
  @Post('current/ready') @HttpCode(200) ready(@CurrentUser() u: AuthUser, @Body() dto: ReadyDto) { return this.rooms.setReady(u.id, dto.ready); }
  @Post('current/start') @HttpCode(200) start(@CurrentUser() u: AuthUser) { return this.rooms.start(u.id); }
  @Post('current/invite') @HttpCode(200) invite(@CurrentUser() u: AuthUser, @Body() dto: InviteDto) { return this.rooms.invite(u.id, dto.userId); }
  @Post('current/kick/:userId') @HttpCode(200)
  kick(@CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) id: string) { return this.rooms.kick(u.id, id); }

  @Get('invites') invites(@CurrentUser() u: AuthUser) { return this.rooms.listInvites(u.id); }
  @Post('invites/:id/accept') @HttpCode(200)
  acceptInvite(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.rooms.acceptInvite(u.id, id); }
  @Delete('invites/:id')
  declineInvite(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.rooms.declineInvite(u.id, id); }
}
