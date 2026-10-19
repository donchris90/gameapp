import { Body, Controller, Get, HttpCode, NotFoundException, Patch, Post, UseGuards } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { publicUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { appError } from '../common/errors';
import { RoomsService } from '../rooms/rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

class UpdateProfileDto {
  @IsString() @MinLength(2) @MaxLength(24) @Matches(/^[^\p{C}<>]+$/u, { message: 'displayName has invalid characters' })
  displayName!: string;
}

class DeleteAccountDto {
  @IsString() @MaxLength(200) password!: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService, private readonly wallet: WalletService, private readonly rooms: RoomsService) {}

  @Get('me')
  async me(@CurrentUser() auth: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id } });
    if (!user) throw new NotFoundException();
    return { ...publicUser(user), coins: Number(await this.wallet.getBalance(user.id)) };
  }

  /**
   * Closes the account: erases personal details and signs the player out everywhere. Remaining coins are
   * forfeited (they can never be withdrawn anyway). The ledger rows stay, tied to an anonymous account.
   */
  @Post('me/delete') @HttpCode(200)
  async deleteAccount(@CurrentUser() auth: AuthUser, @Body() dto: DeleteAccountDto) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id } });
    if (!user) throw new NotFoundException();
    if (!(await argon2.verify(user.passwordHash, dto.password).catch(() => false))) throw appError(403, 'WRONG_PASSWORD', 'Password is incorrect');
    const live = await this.prisma.matchPlayer.count({ where: { userId: user.id, leftAt: null, match: { status: 'ACTIVE' } } });
    if (live > 0) throw appError(409, 'IN_MATCH', 'Finish or resign your current game first');
    await this.rooms.leave(user.id).catch(() => undefined);
    const tag = randomBytes(6).toString('hex');
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.message.deleteMany({ where: { OR: [{ senderId: user.id }, { recipientId: user.id }] } }),
      this.prisma.pushToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.friendship.deleteMany({ where: { OR: [{ userAId: user.id }, { userBId: user.id }] } }),
      this.prisma.block.deleteMany({ where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] } }),
      this.prisma.roomInvite.deleteMany({ where: { OR: [{ fromUserId: user.id }, { toUserId: user.id }] } }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: 'DELETED', email: `deleted-${tag}@deleted.invalid`, username: 'deleted', usernameLower: `deleted-${tag}`,
          displayName: 'Deleted player', friendCode: tag.toUpperCase().slice(0, 8), passwordHash,
          equippedFrame: null, equippedTitle: null,
        },
      }),
    ]);
    return { ok: true };
  }

  @Patch('me')
  async update(@CurrentUser() auth: AuthUser, @Body() dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({ where: { id: auth.id }, data: { displayName: dto.displayName.trim() } });
    return publicUser(user);
  }
}
