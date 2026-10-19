import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';

class SendDto {
  @IsString() @MaxLength(2000) body!: string; // the service enforces the real limit with a clear message
}
class ReportDto {
  @IsUUID() messageId!: string;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations') conversations(@CurrentUser() u: AuthUser) { return this.chat.conversations(u.id); }
  @Get('unread') unread(@CurrentUser() u: AuthUser) { return this.chat.unreadTotal(u.id); }

  @Get('with/:userId')
  messages(
    @CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) other: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number, @Query('before') before?: string,
  ) {
    return this.chat.messages(u.id, other, { limit: Math.min(Math.max(limit, 1), 100), before });
  }

  @Post('with/:userId') @HttpCode(200)
  send(@CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) other: string, @Body() dto: SendDto) { return this.chat.send(u.id, other, dto.body); }

  @Post('with/:userId/read') @HttpCode(200)
  read(@CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) other: string) { return this.chat.markRead(u.id, other); }

  @Post('report') @HttpCode(200)
  report(@CurrentUser() u: AuthUser, @Body() dto: ReportDto) { return this.chat.report(u.id, dto.messageId, dto.reason); }
}
