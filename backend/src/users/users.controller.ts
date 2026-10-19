import { Body, Controller, Get, NotFoundException, Patch, UseGuards } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { publicUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

class UpdateProfileDto {
  @IsString() @MinLength(2) @MaxLength(24) @Matches(/^[^\p{C}<>]+$/u, { message: 'displayName has invalid characters' })
  displayName!: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService, private readonly wallet: WalletService) {}

  @Get('me')
  async me(@CurrentUser() auth: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id } });
    if (!user) throw new NotFoundException();
    return { ...publicUser(user), coins: Number(await this.wallet.getBalance(user.id)) };
  }

  @Patch('me')
  async update(@CurrentUser() auth: AuthUser, @Body() dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({ where: { id: auth.id }, data: { displayName: dto.displayName.trim() } });
    return publicUser(user);
  }
}
