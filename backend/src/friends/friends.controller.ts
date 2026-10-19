import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FriendsService } from './friends.service';

class FriendRequestDto {
  @IsOptional() @IsString() @MaxLength(20) @Matches(/^[A-Za-z0-9_]{3,20}$/)
  username?: string;

  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9]{8}$/, { message: 'friendCode must be 8 letters or numbers' })
  friendCode?: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get('friends')
  list(@CurrentUser() u: AuthUser) { return this.friends.list(u.id); }

  @Get('friends/requests')
  requests(@CurrentUser() u: AuthUser) { return this.friends.requests(u.id); }

  @Get('friends/search')
  search(@CurrentUser() u: AuthUser, @Query('q') q = '') { return this.friends.search(u.id, q); }

  @Post('friends/requests')
  send(@CurrentUser() u: AuthUser, @Body() dto: FriendRequestDto) { return this.friends.sendRequest(u.id, dto); }

  @Post('friends/requests/:id/accept') @HttpCode(200)
  accept(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.friends.accept(u.id, id); }

  @Delete('friends/requests/:id')
  removeRequest(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.friends.removeRequest(u.id, id); }

  @Delete('friends/:userId')
  removeFriend(@CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) id: string) { return this.friends.removeFriend(u.id, id); }

  @Get('blocks')
  blocks(@CurrentUser() u: AuthUser) { return this.friends.blocks(u.id); }

  @Post('blocks/:userId') @HttpCode(200)
  block(@CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) id: string) { return this.friends.block(u.id, id); }

  @Delete('blocks/:userId')
  unblock(@CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) id: string) { return this.friends.unblock(u.id, id); }
}
