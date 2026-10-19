import { Controller, Get, ParseIntPipe, Query, UseGuards, DefaultValuePipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  async balance(@CurrentUser() user: AuthUser) {
    return { coins: Number(await this.wallet.getBalance(user.id)) };
  }

  @Get('ledger')
  async ledger(
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    const { entries, nextCursor } = await this.wallet.listLedger(user.id, { limit: Math.min(Math.max(limit, 1), 100), cursor });
    return {
      entries: entries.map((e) => ({
        id: e.id, type: e.type, amount: Number(e.amount), balanceAfter: e.balanceAfter === null ? null : Number(e.balanceAfter),
        reference: e.reference, createdAt: e.createdAt,
      })),
      nextCursor,
    };
  }
}
