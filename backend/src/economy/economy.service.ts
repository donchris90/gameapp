import { randomBytes } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { appError } from '../common/errors';
import { AppConfig, CONFIG } from '../config/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { AD_KEYS, AdKeyProvider, verifyAdCallback } from './ad-signature';
import { COIN_PACKS, packById } from './packs';
import { Platform, STORE_VERIFIER, StoreVerifier } from './store.verifier';

const DAY_MS = 86_400_000;
const AD_NONCE_TTL_MS = 30 * 60_000;
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Everything that puts coins into a wallet from outside the games: store purchases, daily bonus, rewarded ads. */
@Injectable()
export class EconomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(STORE_VERIFIER) private readonly store: StoreVerifier,
    @Inject(AD_KEYS) private readonly adKeys: AdKeyProvider,
  ) {}

  /** The player's local calendar day, as YYYY-MM-DD. */
  dayOf(now = Date.now()) {
    return new Date(now + this.config.dayOffsetMinutes * 60_000).toISOString().slice(0, 10);
  }

  private lockUser(tx: Prisma.TransactionClient, userId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'economy:' + userId}))`;
  }

  // ---- coin packs ----

  packs() {
    return COIN_PACKS.map((p) => ({ ...p }));
  }

  /** Turns a store receipt into coins. Safe to call again with the same receipt: coins are added once. */
  async redeemPurchase(userId: string, dto: { platform: Platform; productId: string; token: string }) {
    const pack = packById(dto.productId);
    if (!pack) throw appError(400, 'UNKNOWN_PRODUCT', 'That coin pack does not exist');
    const verified = await this.store.verify(dto);
    if (verified.productId !== pack.productId) throw appError(400, 'INVALID_RECEIPT', 'The receipt is for a different product');

    try {
      await this.prisma.$transaction(async (tx) => {
        const p = await tx.purchase.create({ data: { userId, platform: dto.platform, productId: pack.productId, transactionId: verified.transactionId, coins: BigInt(pack.coins) } });
        await this.wallet.credit({ userId, amount: BigInt(pack.coins), type: 'COIN_PURCHASE', reference: `purchase:${p.id}`, idempotencyKey: `purchase:${dto.platform}:${verified.transactionId}` }, tx);
      });
    } catch (e) {
      if (!isUnique(e)) throw e;
      const existing = await this.prisma.purchase.findUnique({ where: { platform_transactionId: { platform: dto.platform, transactionId: verified.transactionId } } });
      if (!existing || existing.userId !== userId) throw appError(409, 'RECEIPT_ALREADY_USED', 'This purchase was already used by another account');
      return { credited: false, coins: pack.coins, balance: Number(await this.wallet.getBalance(userId)) };
    }
    return { credited: true, coins: pack.coins, balance: Number(await this.wallet.getBalance(userId)) };
  }

  // ---- daily bonus ----

  private dailyAmount(streak: number) {
    return this.config.dailyBonusCoins + 10 * (Math.min(streak, 7) - 1);
  }

  async claimDaily(userId: string, now = Date.now()) {
    const day = this.dayOf(now);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const prev = await tx.dailyClaim.findUnique({ where: { userId_day: { userId, day: this.dayOf(now - DAY_MS) } } });
        const streak = (prev?.streak ?? 0) + 1;
        const coins = this.dailyAmount(streak);
        await tx.dailyClaim.create({ data: { userId, day, streak, coins: BigInt(coins) } });
        if (coins > 0) await this.wallet.credit({ userId, amount: BigInt(coins), type: 'DAILY_BONUS', reference: `daily:${day}`, idempotencyKey: `daily:${userId}:${day}` }, tx);
        return { coins, streak, day };
      });
    } catch (e) {
      if (isUnique(e)) throw appError(409, 'ALREADY_CLAIMED', 'You already took today\'s bonus', { nextAt: this.nextDayStart(now) });
      throw e;
    }
  }

  private nextDayStart(now: number) {
    const off = this.config.dayOffsetMinutes * 60_000;
    return new Date(Math.floor((now + off) / DAY_MS) * DAY_MS + DAY_MS - off).toISOString();
  }

  async status(userId: string, now = Date.now()) {
    const day = this.dayOf(now);
    const [today, prev, rewarded, pending] = await Promise.all([
      this.prisma.dailyClaim.findUnique({ where: { userId_day: { userId, day } } }),
      this.prisma.dailyClaim.findUnique({ where: { userId_day: { userId, day: this.dayOf(now - DAY_MS) } } }),
      this.prisma.adView.count({ where: { userId, day, status: 'REWARDED' } }),
      this.prisma.adView.count({ where: { userId, day, status: 'PENDING', createdAt: { gt: new Date(now - AD_NONCE_TTL_MS) } } }),
    ]);
    const nextStreak = (prev?.streak ?? 0) + 1;
    return {
      daily: today
        ? { available: false, streak: today.streak, claimedCoins: Number(today.coins), nextAt: this.nextDayStart(now) }
        : { available: true, streak: prev?.streak ?? 0, coins: this.dailyAmount(nextStreak) },
      ads: { coinsPerAd: this.config.adRewardCoins, dailyCap: this.config.adDailyCap, watchedToday: rewarded, remainingToday: Math.max(this.config.adDailyCap - rewarded - pending, 0) },
    };
  }

  // ---- rewarded ads ----

  /** Called before showing an ad. The returned nonce goes into the ad's server-side verification options as custom data. */
  async startAd(userId: string, now = Date.now()) {
    const day = this.dayOf(now);
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const used = await tx.adView.count({
        where: { userId, day, OR: [{ status: 'REWARDED' }, { status: 'PENDING', createdAt: { gt: new Date(now - AD_NONCE_TTL_MS) } }] },
      });
      if (this.config.adRewardCoins <= 0 || used >= this.config.adDailyCap) throw appError(429, 'AD_LIMIT_REACHED', 'No more reward ads today', { nextAt: this.nextDayStart(now) });
      const nonce = randomBytes(16).toString('hex');
      await tx.adView.create({ data: { userId, nonce, day } });
      return { nonce, userId, coins: this.config.adRewardCoins };
    });
  }

  /**
   * AdMob's server-to-server callback. Only a correctly signed callback for one of our pending nonces pays coins,
   * and each ad transaction pays once. Always answers OK for callbacks we understand, so the network stops retrying.
   */
  async handleAdCallback(rawQuery: string, now = Date.now()) {
    const q = new URLSearchParams(rawQuery);
    if (this.config.storeMode !== 'fake' && !(await verifyAdCallback(rawQuery, this.adKeys))) throw appError(403, 'BAD_SIGNATURE', 'Invalid signature');
    const userId = q.get('user_id'), nonce = q.get('custom_data'), transactionId = q.get('transaction_id');
    if (!userId || !nonce || !transactionId) throw appError(400, 'BAD_CALLBACK', 'Missing fields');

    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const view = await tx.adView.findUnique({ where: { nonce } });
      if (!view || view.userId !== userId) throw appError(400, 'UNKNOWN_AD', 'Unknown ad');
      if (view.status === 'REWARDED') return { ok: true, credited: false };
      const expire = async () => { await tx.adView.update({ where: { id: view.id }, data: { status: 'EXPIRED' } }); return { ok: true, credited: false }; };
      if (view.status === 'EXPIRED' || view.createdAt.getTime() < now - AD_NONCE_TTL_MS) return view.status === 'EXPIRED' ? { ok: true, credited: false } : expire();
      const done = await tx.adView.count({ where: { userId, day: view.day, status: 'REWARDED' } });
      if (done >= this.config.adDailyCap) return expire();

      const coins = this.config.adRewardCoins;
      const claimed = await tx.adView.updateMany({ where: { id: view.id, status: 'PENDING' }, data: { status: 'REWARDED', transactionId, coins: BigInt(coins), rewardedAt: new Date(now) } });
      if (claimed.count === 0) return { ok: true, credited: false };
      if (coins > 0) await this.wallet.credit({ userId, amount: BigInt(coins), type: 'AD_REWARD', reference: `ad:${view.id}`, idempotencyKey: `ad:${transactionId}` }, tx);
      return { ok: true, credited: true };
    });
  }
}
