import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

/** Most Apex coins one account can bring into the shared wallet per UTC day. */
export const APEX_DAILY_EARN_CAP = 20000;
/** Largest single Apex payout (a championship round pays well under this). */
export const APEX_MAX_EARN = 5000;
/** One-time move of the coins an older Apex save already held locally. */
export const APEX_LEGACY_CAP = 50000;
export const APEX_LEGACY_KEY = 'legacy-import';

@Injectable()
export class ApexCoinsService {
  constructor(private readonly prisma: PrismaService, private readonly wallet: WalletService) {}

  private checkKey(key: string) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9:_.-]{6,80}$/.test(key)) throw new BadRequestException('A valid key is required');
  }

  /** Coins won in Apex Run. Capped per payout and per day; the same key never pays twice. */
  async earn(userId: string, amount: number, key: string) {
    this.checkKey(key);
    if (!Number.isInteger(amount) || amount <= 0) throw new BadRequestException('Amount must be a positive whole number');
    const legacy = key === APEX_LEGACY_KEY;
    if (amount > (legacy ? APEX_LEGACY_CAP : APEX_MAX_EARN)) throw new BadRequestException('Amount is too large');
    const reference = `apex:${key}`;
    const idempotencyKey = `apex-earn:${userId}:${key}`;

    let grant = BigInt(amount);
    const prior = await this.prisma.ledgerEntry.findUnique({ where: { idempotencyKey } });
    if (!prior && !legacy) {
      const start = new Date(); start.setUTCHours(0, 0, 0, 0);
      const w = await this.prisma.wallet.findUnique({ where: { userId } });
      const today = w ? await this.prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { walletId: w.id, type: 'GAME_PAYOUT', reference: { startsWith: 'apex:' }, createdAt: { gte: start } },
      }) : { _sum: { amount: null } };
      const room = BigInt(APEX_DAILY_EARN_CAP) - (today._sum.amount ?? 0n);
      grant = room <= 0n ? 0n : grant < room ? grant : room;
    }
    // A retry of a payout that was already trimmed must trim the same way, so reuse what was stored.
    if (prior) grant = prior.amount;
    if (grant > 0n) await this.wallet.credit({ userId, amount: grant, type: 'GAME_PAYOUT', reference, idempotencyKey });
    return { credited: Number(grant), coins: Number(await this.wallet.getBalance(userId)) };
  }

  /** Coins spent inside Apex (cars, upgrades, fuel, repairs). Fails with 402 when the wallet is short. */
  async spend(userId: string, amount: number, key: string, item: string) {
    this.checkKey(key);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) throw new BadRequestException('Amount must be a positive whole number');
    const safeItem = String(item ?? 'item').replace(/[^A-Za-z0-9:_.-]/g, '').slice(0, 40) || 'item';
    await this.wallet.debit({ userId, amount: BigInt(amount), type: 'SHOP_PURCHASE', reference: `apex:${safeItem}`, idempotencyKey: `apex-spend:${userId}:${key}` });
    return { coins: Number(await this.wallet.getBalance(userId)) };
  }
}
