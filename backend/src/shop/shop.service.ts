import { Injectable } from '@nestjs/common';
import { appError } from '../common/errors';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { ItemKind, SHOP_ITEMS, itemById } from './items';

const COLUMN: Record<ItemKind, 'equippedFrame' | 'equippedTitle' | 'equippedTheme'> = { FRAME: 'equippedFrame', TITLE: 'equippedTitle', THEME: 'equippedTheme' };
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService, private readonly wallet: WalletService) {}

  async list(userId: string) {
    const [owned, user] = await Promise.all([
      this.prisma.userItem.findMany({ where: { userId }, select: { itemId: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { equippedFrame: true, equippedTitle: true, equippedTheme: true } }),
    ]);
    const have = new Set(owned.map((o) => o.itemId));
    return {
      items: SHOP_ITEMS.map((i) => ({ id: i.id, kind: i.kind, name: i.name, price: i.price, look: i.look, owned: !!i.free || have.has(i.id) })),
      equipped: { frame: user.equippedFrame, title: user.equippedTitle, theme: user.equippedTheme ?? 'theme_midnight' },
    };
  }

  async buy(userId: string, itemId: string) {
    const item = itemById(itemId);
    if (!item) throw appError(404, 'ITEM_NOT_FOUND', 'No such item');
    if (item.free) throw appError(409, 'ALREADY_OWNED', 'You already have this');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.userItem.create({ data: { userId, itemId, pricePaid: BigInt(item.price) } });
        await this.wallet.debit({ userId, amount: BigInt(item.price), type: 'SHOP_PURCHASE', reference: `shop:${itemId}`, idempotencyKey: `shop:${userId}:${itemId}` }, tx);
      });
    } catch (e) {
      if (isUnique(e)) throw appError(409, 'ALREADY_OWNED', 'You already have this');
      throw e; // not enough coins rolls the whole purchase back, so no item is given for free
    }
    return { itemId, balance: Number(await this.wallet.getBalance(userId)) };
  }

  private async assertOwned(userId: string, itemId: string) {
    const item = itemById(itemId);
    if (!item) throw appError(404, 'ITEM_NOT_FOUND', 'No such item');
    if (!item.free && !(await this.prisma.userItem.findUnique({ where: { userId_itemId: { userId, itemId } } }))) throw appError(403, 'NOT_OWNED', 'Buy this item first');
    return item;
  }

  async equip(userId: string, itemId: string) {
    const item = await this.assertOwned(userId, itemId);
    await this.prisma.user.update({ where: { id: userId }, data: { [COLUMN[item.kind]]: itemId } });
    return this.list(userId);
  }

  async unequip(userId: string, kind: ItemKind) {
    await this.prisma.user.update({ where: { id: userId }, data: { [COLUMN[kind]]: null } });
    return this.list(userId);
  }
}
