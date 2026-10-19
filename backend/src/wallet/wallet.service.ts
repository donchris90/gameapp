import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { LedgerEntryType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type Tx = Prisma.TransactionClient;

export interface Movement {
  userId: string;
  /** Always positive. Direction comes from credit() / debit(). */
  amount: bigint;
  type: LedgerEntryType;
  /** Free-form link to what caused this (match id, purchase id, shop item). */
  reference?: string;
  /** Same key + same movement = safe retry. Same key + different movement = rejected. */
  idempotencyKey: string;
}

/** Which ledger types may add coins and which may remove them. */
export const CREDIT_TYPES: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  'SIGNUP_BONUS', 'DAILY_BONUS', 'AD_REWARD', 'COIN_PURCHASE', 'GAME_PAYOUT', 'GAME_REFUND', 'ADJUSTMENT',
]);
export const DEBIT_TYPES: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  'GAME_STAKE', 'SHOP_PURCHASE', 'ADJUSTMENT',
]);

export class InsufficientCoinsException extends HttpException {
  constructor() {
    super({ statusCode: 402, error: 'INSUFFICIENT_COINS', message: 'Not enough coins' }, HttpStatus.PAYMENT_REQUIRED);
  }
}

class IdempotentRace extends Error {
  constructor(public readonly key: string) {
    super('idempotent race');
  }
}

/**
 * The only code that changes a coin balance. Every change is a ledger entry
 * written in the same database transaction as the balance update, under a row
 * lock, so the balance can never drift from the ledger and two requests can
 * never spend the same coins.
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  ensureWallet(tx: Tx, userId: string) {
    return tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  async getBalance(userId: string): Promise<bigint> {
    const w = await this.prisma.wallet.findUnique({ where: { userId } });
    return w?.balance ?? 0n;
  }

  async credit(mv: Movement, tx?: Tx) {
    if (!CREDIT_TYPES.has(mv.type)) throw new BadRequestException(`${mv.type} cannot add coins`);
    return this.apply(mv, mv.amount, tx);
  }

  async debit(mv: Movement, tx?: Tx) {
    if (!DEBIT_TYPES.has(mv.type)) throw new BadRequestException(`${mv.type} cannot remove coins`);
    return this.apply(mv, -mv.amount, tx);
  }

  /** Entries that belong to the platform, not a user (for example the house cut of a pot). */
  async recordPlatformEntry(
    p: { type: 'HOUSE_FEE'; amount: bigint; reference?: string; idempotencyKey: string },
    tx?: Tx,
  ) {
    if (p.amount <= 0n) throw new BadRequestException('Amount must be positive');
    const db = tx ?? this.prisma;
    const existing = await db.ledgerEntry.findUnique({ where: { idempotencyKey: p.idempotencyKey } });
    if (existing) {
      if (existing.walletId !== null || existing.type !== p.type || existing.amount !== p.amount || (existing.reference ?? null) !== (p.reference ?? null)) {
        throw new BadRequestException('Idempotency key already used for a different entry');
      }
      return existing;
    }
    return db.ledgerEntry.create({
      data: { walletId: null, type: p.type, amount: p.amount, reference: p.reference, idempotencyKey: p.idempotencyKey },
    });
  }

  async listLedger(userId: string, opts: { limit: number; cursor?: string }) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return { entries: [], nextCursor: null as string | null };
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, opts.limit);
    return { entries: page, nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null };
  }

  private async apply(mv: Movement, signed: bigint, externalTx?: Tx) {
    if (mv.amount <= 0n) throw new BadRequestException('Amount must be positive');
    if (!mv.idempotencyKey) throw new BadRequestException('idempotencyKey is required');

    const run = async (tx: Tx) => {
      const wallet = await this.ensureWallet(tx, mv.userId);
      // Lock first, then read: concurrent movements on one wallet run one at a time.
      const rows = await tx.$queryRaw<Array<{ balance: bigint }>>(
        Prisma.sql`SELECT "balance" FROM "Wallet" WHERE "id" = ${wallet.id} FOR UPDATE`,
      );
      const current = rows[0].balance;

      const existing = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: mv.idempotencyKey } });
      if (existing) {
        this.assertSame(existing, mv, signed, wallet.id);
        return existing;
      }

      const next = current + signed;
      if (next < 0n) throw new InsufficientCoinsException();

      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: next } });
      try {
        return await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id, type: mv.type, amount: signed, balanceAfter: next,
            reference: mv.reference, idempotencyKey: mv.idempotencyKey,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new IdempotentRace(mv.idempotencyKey);
        throw e;
      }
    };

    if (externalTx) return run(externalTx);

    try {
      return await this.prisma.$transaction(run);
    } catch (e) {
      if (e instanceof IdempotentRace) {
        const winner = await this.prisma.ledgerEntry.findUnique({ where: { idempotencyKey: e.key } });
        const wallet = await this.prisma.wallet.findUnique({ where: { userId: mv.userId } });
        if (winner && wallet) {
          this.assertSame(winner, mv, signed, wallet.id);
          return winner;
        }
      }
      throw e;
    }
  }

  private assertSame(
    existing: { walletId: string | null; type: LedgerEntryType; amount: bigint; reference: string | null },
    mv: Movement,
    signed: bigint,
    walletId: string,
  ) {
    if (existing.walletId !== walletId || existing.type !== mv.type || existing.amount !== signed || (existing.reference ?? null) !== (mv.reference ?? null)) {
      throw new BadRequestException('Idempotency key already used for a different coin movement');
    }
  }
}
