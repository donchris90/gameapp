import { Body, Controller, Delete, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { appError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { isExpoToken } from './push.service';

class TokenDto {
  @IsString() @MaxLength(200) token!: string;
}
class RegisterDto extends TokenDto {
  @IsIn(['android', 'ios']) platform!: 'android' | 'ios';
}

const MAX_TOKENS_PER_USER = 5;

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly prisma: PrismaService) {}

  /** The app calls this after sign-in. A phone belongs to whoever signed in last. */
  @Post('token') @HttpCode(200)
  async register(@CurrentUser() u: AuthUser, @Body() dto: RegisterDto) {
    if (!isExpoToken(dto.token)) throw appError(400, 'BAD_TOKEN', 'Not a valid push token');
    await this.prisma.pushToken.upsert({
      where: { token: dto.token }, create: { userId: u.id, token: dto.token, platform: dto.platform }, update: { userId: u.id, platform: dto.platform },
    });
    const mine = await this.prisma.pushToken.findMany({ where: { userId: u.id }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
    if (mine.length > MAX_TOKENS_PER_USER) await this.prisma.pushToken.deleteMany({ where: { id: { in: mine.slice(MAX_TOKENS_PER_USER).map((t) => t.id) } } });
    return { ok: true };
  }

  /** Called on sign-out so the next person on this phone does not get your notifications. */
  @Delete('token') @HttpCode(200)
  async remove(@CurrentUser() u: AuthUser, @Body() dto: TokenDto) {
    await this.prisma.pushToken.deleteMany({ where: { userId: u.id, token: dto.token } });
    return { ok: true };
  }
}
