import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { appError } from '../common/errors';
import { AppConfig, CONFIG } from '../config/config';
import { Prisma, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

const DAY = 86_400_000;
const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly wallet: WalletService, @Inject(CONFIG) private readonly config: AppConfig) {}

  /** Start of the local day (Nigeria by default), as a Date. */
  private todayStart(now = Date.now()) {
    const off = this.config.dayOffsetMinutes * 60_000;
    return new Date(Math.floor((now + off) / DAY) * DAY - off);
  }

  async stats(now = Date.now()) {
    const since = this.todayStart(now);
    const sum = async (type: string, from?: Date) => {
      const r = await this.prisma.$queryRaw<Array<{ s: bigint }>>(Prisma.sql`
        SELECT COALESCE(SUM("amount"),0)::bigint AS s FROM "LedgerEntry" WHERE "type" = ${type}::"LedgerEntryType" ${from ? Prisma.sql`AND "createdAt" >= ${from}` : Prisma.empty}`);
      return num(r[0].s);
    };
    const [users, newToday, byStatus, wallets, active, matchesToday, matchesAll, purchasesToday, purchasesAll, feeToday, feeAll, adsToday, dailyToday, playersToday] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      this.prisma.user.groupBy({ by: ['status'], _count: true }),
      this.prisma.wallet.aggregate({ _sum: { balance: true } }),
      this.prisma.match.count({ where: { status: 'ACTIVE' } }),
      this.prisma.match.count({ where: { startedAt: { gte: since } } }),
      this.prisma.match.count(),
      this.prisma.purchase.count({ where: { createdAt: { gte: since } } }),
      this.prisma.purchase.count(),
      sum('HOUSE_FEE', since), sum('HOUSE_FEE'), sum('AD_REWARD', since), sum('DAILY_BONUS', since),
      this.prisma.matchPlayer.findMany({ where: { match: { startedAt: { gte: since } } }, distinct: ['userId'], select: { userId: true } }),
    ]);
    const coinsSold = await this.prisma.purchase.aggregate({ _sum: { coins: true } });
    const coinsSoldToday = await this.prisma.purchase.aggregate({ _sum: { coins: true }, where: { createdAt: { gte: since } } });
    return {
      users: { total: users, newToday, activePlayersToday: playersToday.length, byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count])) },
      coins: { inCirculation: num(wallets._sum.balance), houseFeeToday: feeToday, houseFeeAllTime: feeAll, soldToday: num(coinsSoldToday._sum.coins), soldAllTime: num(coinsSold._sum.coins), adRewardsToday: adsToday, dailyBonusToday: dailyToday },
      matches: { activeNow: active, today: matchesToday, allTime: matchesAll },
      purchases: { today: purchasesToday, allTime: purchasesAll },
    };
  }

  async users(opts: { q?: string; limit: number; cursor?: string }) {
    const q = opts.q?.trim().toLowerCase();
    const rows = await this.prisma.user.findMany({
      where: q ? { OR: [{ usernameLower: { contains: q } }, { email: { contains: q } }, { friendCode: { equals: q.toUpperCase() } }] } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: { wallet: { select: { balance: true } } },
    });
    const page = rows.slice(0, opts.limit);
    return {
      users: page.map((u) => ({ id: u.id, email: u.email, username: u.username, displayName: u.displayName, role: u.role, status: u.status, coins: num(u.wallet?.balance), createdAt: u.createdAt })),
      nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null,
    };
  }

  async user(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { wallet: { select: { balance: true } } } });
    if (!u) throw appError(404, 'USER_NOT_FOUND', 'No such player');
    const [ledger, matches, purchases, audits, adsToday] = await Promise.all([
      this.prisma.ledgerEntry.findMany({ where: { wallet: { userId: id } }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.matchPlayer.findMany({ where: { userId: id }, orderBy: { match: { startedAt: 'desc' } }, take: 15, include: { match: { select: { game: true, status: true, endReason: true, startedAt: true } } } }),
      this.prisma.purchase.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.auditLog.findMany({ where: { targetUserId: id }, orderBy: { createdAt: 'desc' }, take: 10, include: { admin: { select: { username: true } } } }),
      this.prisma.adView.count({ where: { userId: id, status: 'REWARDED' } }),
    ]);
    return {
      user: { id: u.id, email: u.email, username: u.username, displayName: u.displayName, friendCode: u.friendCode, role: u.role, status: u.status, birthDate: u.birthDate, createdAt: u.createdAt, coins: num(u.wallet?.balance) },
      ledger: ledger.map((e) => ({ id: e.id, type: e.type, amount: num(e.amount), balanceAfter: e.balanceAfter === null ? null : num(e.balanceAfter), reference: e.reference, createdAt: e.createdAt })),
      matches: matches.map((m) => ({ matchId: m.matchId, game: m.match.game, status: m.match.status, endReason: m.match.endReason, result: m.result, stake: num(m.stake), payout: num(m.payout), createdAt: m.match.startedAt })),
      purchases: purchases.map((p) => ({ id: p.id, platform: p.platform, productId: p.productId, transactionId: p.transactionId, coins: num(p.coins), createdAt: p.createdAt })),
      audits: audits.map((a) => ({ id: a.id, action: a.action, by: a.admin.username, data: a.data, createdAt: a.createdAt })),
      adsWatched: adsToday,
    };
  }

  async setStatus(adminId: string, targetId: string, status: UserStatus, reason: string) {
    if (adminId === targetId) throw appError(400, 'SELF', 'You cannot change your own status');
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, status: true } });
      if (!t) throw appError(404, 'USER_NOT_FOUND', 'No such player');
      if (t.role === 'ADMIN') throw appError(403, 'IS_ADMIN', 'Admins cannot be suspended or banned here');
      await tx.user.update({ where: { id: targetId }, data: { status } });
      if (status !== 'ACTIVE') await tx.refreshToken.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { adminId, action: 'SET_STATUS', targetUserId: targetId, data: { from: t.status, to: status, reason } } });
      return { id: targetId, status };
    });
  }

  /** Adds (positive) or removes (negative) coins, with a reason, in the ledger and the audit log. */
  async adjust(adminId: string, targetId: string, amount: number, reason: string) {
    if (!Number.isInteger(amount) || amount === 0) throw appError(400, 'BAD_AMOUNT', 'Amount must be a whole number, not zero');
    const key = `admin:${randomUUID()}`;
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.user.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!t) throw appError(404, 'USER_NOT_FOUND', 'No such player');
      const mv = { userId: targetId, amount: BigInt(Math.abs(amount)), type: 'ADJUSTMENT' as const, reference: `admin:${adminId}`, idempotencyKey: key };
      if (amount > 0) await this.wallet.credit(mv, tx); else await this.wallet.debit(mv, tx);
      await tx.auditLog.create({ data: { adminId, action: 'ADJUST_COINS', targetUserId: targetId, data: { amount, reason } } });
    });
    return { balance: num(await this.wallet.getBalance(targetId)) };
  }

  async matches(opts: { status?: 'ACTIVE' | 'FINISHED'; limit: number; cursor?: string }) {
    const rows = await this.prisma.match.findMany({
      where: opts.status ? { status: opts.status } : undefined,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: { players: { include: { user: { select: { username: true } } } } },
    });
    const page = rows.slice(0, opts.limit);
    return {
      matches: page.map((m) => ({
        id: m.id, game: m.game, status: m.status, endReason: m.endReason, stake: num(m.stake), pot: num(m.pot), houseFee: num(m.houseFee), createdAt: m.startedAt, finishedAt: m.finishedAt,
        players: m.players.map((p) => ({ userId: p.userId, username: p.user.username, result: p.result, payout: num(p.payout) })),
      })),
      nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null,
    };
  }

  async purchases(opts: { limit: number; cursor?: string }) {
    const rows = await this.prisma.purchase.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: { user: { select: { username: true } } },
    });
    const page = rows.slice(0, opts.limit);
    return {
      purchases: page.map((p) => ({ id: p.id, userId: p.userId, username: p.user.username, platform: p.platform, productId: p.productId, transactionId: p.transactionId, coins: num(p.coins), createdAt: p.createdAt })),
      nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null,
    };
  }

  async audit(opts: { limit: number; cursor?: string }) {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: { admin: { select: { username: true } }, target: { select: { username: true } } },
    });
    const page = rows.slice(0, opts.limit);
    return {
      entries: page.map((a) => ({ id: a.id, action: a.action, admin: a.admin.username, target: a.target?.username ?? null, targetUserId: a.targetUserId, data: a.data, createdAt: a.createdAt })),
      nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null,
    };
  }
}
