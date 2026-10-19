import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InsufficientCoinsException, WalletService } from '../src/wallet/wallet.service';
import { createApp, prismaOf, registerUser } from './helpers';

describe('Wallet ledger', () => {
  let app: INestApplication;
  let wallet: WalletService;

  beforeAll(async () => {
    app = await createApp();
    wallet = app.get(WalletService);
  });
  afterAll(() => app.close());

  const key = (() => { let i = 0; return (p: string) => `${p}:${Date.now()}:${i++}:${Math.random()}`; })();

  async function newUser() {
    const { user } = await registerUser(app);
    return user.id as string; // starts with the 1000 coin signup bonus
  }

  it('gives a new account the signup bonus as a ledger entry', async () => {
    const id = await newUser();
    expect(await wallet.getBalance(id)).toBe(1000n);
    const { entries } = await wallet.listLedger(id, { limit: 10 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'SIGNUP_BONUS', amount: 1000n, balanceAfter: 1000n });
  });

  it('credits and debits, and the balance always equals the ledger sum', async () => {
    const id = await newUser();
    await wallet.credit({ userId: id, amount: 500n, type: 'AD_REWARD', idempotencyKey: key('ad') });
    await wallet.debit({ userId: id, amount: 200n, type: 'GAME_STAKE', reference: 'match:1', idempotencyKey: key('stake') });
    await wallet.credit({ userId: id, amount: 380n, type: 'GAME_PAYOUT', reference: 'match:1', idempotencyKey: key('pay') });
    const balance = await wallet.getBalance(id);
    expect(balance).toBe(1000n + 500n - 200n + 380n);
    const sum = await prismaOf(app).$queryRaw<Array<{ s: bigint }>>`
      SELECT COALESCE(SUM(l."amount"),0)::bigint AS s FROM "LedgerEntry" l JOIN "Wallet" w ON w."id" = l."walletId" WHERE w."userId" = ${id}`;
    expect(sum[0].s).toBe(balance);
  });

  it('rejects spending more than the balance and leaves no trace', async () => {
    const id = await newUser();
    await expect(wallet.debit({ userId: id, amount: 1001n, type: 'GAME_STAKE', idempotencyKey: key('s') })).rejects.toBeInstanceOf(InsufficientCoinsException);
    expect(await wallet.getBalance(id)).toBe(1000n);
    expect((await wallet.listLedger(id, { limit: 10 })).entries).toHaveLength(1);
  });

  it('treats a retry with the same key as the same movement, applied once', async () => {
    const id = await newUser();
    const k = key('retry');
    const a = await wallet.debit({ userId: id, amount: 100n, type: 'SHOP_PURCHASE', reference: 'item:1', idempotencyKey: k });
    const b = await wallet.debit({ userId: id, amount: 100n, type: 'SHOP_PURCHASE', reference: 'item:1', idempotencyKey: k });
    expect(b.id).toBe(a.id);
    expect(await wallet.getBalance(id)).toBe(900n);
  });

  it('refuses a reused key for a different movement', async () => {
    const id = await newUser();
    const k = key('reuse');
    await wallet.debit({ userId: id, amount: 100n, type: 'SHOP_PURCHASE', idempotencyKey: k });
    await expect(wallet.debit({ userId: id, amount: 150n, type: 'SHOP_PURCHASE', idempotencyKey: k })).rejects.toThrow(/different coin movement/);
    await expect(wallet.credit({ userId: id, amount: 100n, type: 'AD_REWARD', idempotencyKey: k })).rejects.toThrow(/different coin movement/);
    expect(await wallet.getBalance(id)).toBe(900n);
  });

  it('applies the same key sent twice at the same moment exactly once', async () => {
    const id = await newUser();
    const k = key('dup');
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => wallet.credit({ userId: id, amount: 50n, type: 'AD_REWARD', idempotencyKey: k })),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await wallet.getBalance(id)).toBe(1050n);
  });

  it('never lets concurrent stakes spend the same coins twice', async () => {
    const id = await newUser(); // 1000 coins, 25 stakes of 100 -> exactly 10 can succeed
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, (_, i) => wallet.debit({ userId: id, amount: 100n, type: 'GAME_STAKE', idempotencyKey: key(`c${i}`) })),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toBe(10);
    expect(rejected.every((r) => r.reason instanceof InsufficientCoinsException)).toBe(true);
    expect(await wallet.getBalance(id)).toBe(0n);
  });

  it('only allows ledger types in the direction they belong', async () => {
    const id = await newUser();
    await expect(wallet.credit({ userId: id, amount: 10n, type: 'GAME_STAKE', idempotencyKey: key('x') })).rejects.toThrow(/cannot add coins/);
    await expect(wallet.debit({ userId: id, amount: 10n, type: 'AD_REWARD', idempotencyKey: key('y') })).rejects.toThrow(/cannot remove coins/);
    await expect(wallet.credit({ userId: id, amount: 0n, type: 'AD_REWARD', idempotencyKey: key('z') })).rejects.toThrow(/positive/);
    await expect(wallet.credit({ userId: id, amount: -5n, type: 'AD_REWARD', idempotencyKey: key('w') })).rejects.toThrow(/positive/);
  });

  it('rolls back a movement when the caller transaction fails afterwards', async () => {
    const id = await newUser();
    const prisma = prismaOf(app);
    await expect(
      prisma.$transaction(async (tx) => {
        await wallet.debit({ userId: id, amount: 400n, type: 'GAME_STAKE', idempotencyKey: key('tx') }, tx);
        throw new Error('match creation failed');
      }),
    ).rejects.toThrow('match creation failed');
    expect(await wallet.getBalance(id)).toBe(1000n);
  });

  it('has a database-level guard against a negative balance', async () => {
    const id = await newUser();
    await expect(prismaOf(app).wallet.update({ where: { userId: id }, data: { balance: -1n } })).rejects.toThrow();
  });

  it('records the house fee as a platform entry with no wallet, idempotently', async () => {
    const k = key('fee');
    const a = await wallet.recordPlatformEntry({ type: 'HOUSE_FEE', amount: 40n, reference: 'match:9', idempotencyKey: k });
    const b = await wallet.recordPlatformEntry({ type: 'HOUSE_FEE', amount: 40n, reference: 'match:9', idempotencyKey: k });
    expect(a.walletId).toBeNull();
    expect(b.id).toBe(a.id);
    await expect(wallet.recordPlatformEntry({ type: 'HOUSE_FEE', amount: 41n, reference: 'match:9', idempotencyKey: k })).rejects.toThrow();
  });

  it('serves balance and a paginated ledger over HTTP, newest first', async () => {
    const { tokens, user } = await registerUser(app);
    for (let i = 0; i < 4; i++) await wallet.credit({ userId: user.id, amount: 10n, type: 'AD_REWARD', idempotencyKey: key('p') });
    const auth = { Authorization: `Bearer ${tokens.accessToken}` };
    const bal = await request(app.getHttpServer()).get('/wallet').set(auth).expect(200);
    expect(bal.body).toEqual({ coins: 1040 });
    const p1 = await request(app.getHttpServer()).get('/wallet/ledger?limit=3').set(auth).expect(200);
    expect(p1.body.entries).toHaveLength(3);
    expect(p1.body.entries[0].type).toBe('AD_REWARD');
    const p2 = await request(app.getHttpServer()).get(`/wallet/ledger?limit=3&cursor=${p1.body.nextCursor}`).set(auth).expect(200);
    expect(p2.body.entries).toHaveLength(2);
    expect(p2.body.entries[1].type).toBe('SIGNUP_BONUS');
    expect(p2.body.nextCursor).toBeNull();
    await request(app.getHttpServer()).get('/wallet').expect(401);
  });
});
