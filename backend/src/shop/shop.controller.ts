import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { appError } from '../common/errors';
import { ItemKind } from './items';
import { ShopService } from './shop.service';

@Controller('shop')
@UseGuards(JwtAuthGuard)
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get('items') list(@CurrentUser() u: AuthUser) { return this.shop.list(u.id); }
  @Post('items/:id/buy') @HttpCode(200) buy(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.shop.buy(u.id, id); }
  @Post('items/:id/equip') @HttpCode(200) equip(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.shop.equip(u.id, id); }
  @Post('unequip/:kind') @HttpCode(200)
  unequip(@CurrentUser() u: AuthUser, @Param('kind') kind: string) {
    const k = kind.toUpperCase();
    if (k !== 'FRAME' && k !== 'TITLE' && k !== 'THEME') throw appError(400, 'BAD_KIND', 'kind must be frame, title or theme');
    return this.shop.unequip(u.id, k as ItemKind);
  }
}
