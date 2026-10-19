import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EconomyService } from './economy.service';

class RedeemDto {
  @IsIn(['GOOGLE', 'APPLE']) platform!: 'GOOGLE' | 'APPLE';
  @IsString() @MinLength(1) @MaxLength(64) productId!: string;
  /** Google: the purchase token. Apple: the transaction id. */
  @IsString() @MinLength(1) @MaxLength(4096) token!: string;
}

@Controller()
export class EconomyController {
  constructor(private readonly economy: EconomyService) {}

  @Get('store/packs') @UseGuards(JwtAuthGuard)
  packs() { return { packs: this.economy.packs() }; }

  @Post('store/purchases') @HttpCode(200) @UseGuards(JwtAuthGuard)
  redeem(@CurrentUser() u: AuthUser, @Body() dto: RedeemDto) { return this.economy.redeemPurchase(u.id, dto); }

  @Get('rewards') @UseGuards(JwtAuthGuard)
  status(@CurrentUser() u: AuthUser) { return this.economy.status(u.id); }

  @Post('rewards/daily') @HttpCode(200) @UseGuards(JwtAuthGuard)
  daily(@CurrentUser() u: AuthUser) { return this.economy.claimDaily(u.id); }

  @Post('ads/rewarded/start') @HttpCode(200) @UseGuards(JwtAuthGuard)
  startAd(@CurrentUser() u: AuthUser) { return this.economy.startAd(u.id); }

  /** AdMob server-side verification callback. No login: the signature is the proof. */
  @Get('ads/ssv') @HttpCode(200)
  ssv(@Req() req: { originalUrl: string }) {
    const at = req.originalUrl.indexOf('?');
    return this.economy.handleAdCallback(at < 0 ? '' : req.originalUrl.slice(at + 1));
  }
}
