import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { EconomyService } from '../src/economy/economy.service';
import { Player, bearer, createApp, newPlayer, prismaOf } from './helpers';

describe('Economy: coin packs, daily bonus, rewarded ads', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  const coins = async (p: Player) => (await http().get('/wallet').set(bearer(p)).expect(200)).body.coins as number;
  const redeem = (p: Player, body: object) => http().post('/store/purchases').set(bearer(p)).send(body);
  const ledger = (p: Player, type: string) => prismaOf(app).ledgerEntry.count({ where: { wallet: { userId: p.user.id }, type: type as any } });

  describe('coin packs', () => {
    it('lists the packs for sale', async () => {
      const p = await newPlayer(app);
      const { packs } = (await http().get('/store/packs').set(bearer(p)).expect(200)).body;
      expect(packs.map((x: any) => x.productId)).toEqual(['coins_500', 'coins_1200', 'coins_3000', 'coins_7000', 'coins_16000']);
      await http().get('/store/packs').expect(401);
    });

    it('turns a verified receipt into coins and records it in the ledger', async () => {
      const p = await newPlayer(app);
      const r = (await redeem(p, { platform: 'GOOGLE', productId: 'coins_1200', token: 'fake:order-1:coins_1200' }).expect(200)).body;
      expect(r).toEqual({ credited: true, coins: 1200, balance: 2200 });
      expect(await coins(p)).toBe(2200);
      expect(await ledger(p, 'COIN_PURCHASE')).toBe(1);
    });

    it('credits a receipt once, however many times it is sent', async () => {
      const p = await newPlayer(app);
      const body = { platform: 'APPLE', productId: 'coins_500', token: 'fake:tx-77:coins_500' };
      await redeem(p, body).expect(200);
      const again = (await redeem(p, body).expect(200)).body;
      expect(again).toMatchObject({ credited: false, balance: 1500 });
      expect(await coins(p)).toBe(1500);
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => redeem(p, { ...body, token: 'fake:tx-78:coins_500' })));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(await coins(p)).toBe(2000); // tx-78 paid exactly once
      expect(await ledger(p, 'COIN_PURCHASE')).toBe(2);
    });

    it('does not let a second account use somebody else\'s receipt', async () => {
      const a = await newPlayer(app), b = await newPlayer(app);
      const body = { platform: 'GOOGLE', productId: 'coins_500', token: 'fake:shared-order:coins_500' };
      await redeem(a, body).expect(200);
      expect((await redeem(b, body).expect(409)).body.error).toBe('RECEIPT_ALREADY_USED');
      expect(await coins(b)).toBe(1000);
    });

    it('keeps Google and Apple transaction ids separate', async () => {
      const p = await newPlayer(app);
      await redeem(p, { platform: 'GOOGLE', productId: 'coins_500', token: 'fake:same-id:coins_500' }).expect(200);
      await redeem(p, { platform: 'APPLE', productId: 'coins_500', token: 'fake:same-id:coins_500' }).expect(200);
      expect(await coins(p)).toBe(2000);
    });

    it('refuses unknown packs, mismatched or malformed receipts, and bad input', async () => {
      const p = await newPlayer(app);
      expect((await redeem(p, { platform: 'GOOGLE', productId: 'coins_999999', token: 'fake:x:coins_999999' }).expect(400)).body.error).toBe('UNKNOWN_PRODUCT');
      expect((await redeem(p, { platform: 'GOOGLE', productId: 'coins_16000', token: 'fake:cheap:coins_500' }).expect(400)).body.error).toBe('INVALID_RECEIPT');
      expect((await redeem(p, { platform: 'GOOGLE', productId: 'coins_500', token: 'garbage' }).expect(400)).body.error).toBe('INVALID_RECEIPT');
      await redeem(p, { platform: 'WINDOWS', productId: 'coins_500', token: 'x' }).expect(400);
      await redeem(p, { platform: 'GOOGLE', productId: 'coins_500' }).expect(400);
      await http().post('/store/purchases').send({ platform: 'GOOGLE', productId: 'coins_500', token: 'fake:z:coins_500' }).expect(401);
      expect(await coins(p)).toBe(1000);
    });
  });

  describe('daily bonus', () => {
    it('can be taken once per day', async () => {
      const p = await newPlayer(app);
      const s0 = (await http().get('/rewards').set(bearer(p)).expect(200)).body;
      expect(s0.daily).toEqual({ available: true, streak: 0, coins: 50 });
      const r = (await http().post('/rewards/daily').set(bearer(p)).expect(200)).body;
      expect(r).toMatchObject({ coins: 50, streak: 1 });
      expect(await coins(p)).toBe(1050);
      const again = await http().post('/rewards/daily').set(bearer(p)).expect(409);
      expect(again.body.error).toBe('ALREADY_CLAIMED');
      expect(again.body.nextAt).toBeTruthy();
      const s1 = (await http().get('/rewards').set(bearer(p)).expect(200)).body;
      expect(s1.daily).toMatchObject({ available: false, streak: 1, claimedCoins: 50 });
      expect(await ledger(p, 'DAILY_BONUS')).toBe(1);
    });

    it('grows with a streak up to day seven and starts over after a missed day', async () => {
      const p = await newPlayer(app);
      const eco = app.get(EconomyService);
      const day = 86_400_000, t0 = Date.now() + 100 * day;
      const got: number[] = [];
      for (let i = 0; i < 9; i++) got.push((await eco.claimDaily(p.user.id, t0 + i * day)).coins);
      expect(got).toEqual([50, 60, 70, 80, 90, 100, 110, 110, 110]);
      const after = await eco.claimDaily(p.user.id, t0 + 11 * day); // skipped a day
      expect(after).toMatchObject({ streak: 1, coins: 50 });
    });

    it('does not pay twice when two requests arrive together', async () => {
      const p = await newPlayer(app);
      const rs = await Promise.all([1, 2, 3, 4].map(() => http().post('/rewards/daily').set(bearer(p))));
      expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
      expect(rs.filter((r) => r.status === 409)).toHaveLength(3);
      expect(await coins(p)).toBe(1050);
    });

    it('resets at midnight local time (Lagos), not UTC', () => {
      const eco = app.get(EconomyService);
      expect(eco.dayOf(Date.parse('2026-10-19T22:59:00Z'))).toBe('2026-10-19');
      expect(eco.dayOf(Date.parse('2026-10-19T23:00:00Z'))).toBe('2026-10-20');
    });
  });

  describe('rewarded ads', () => {
    const callback = (user: string, nonce: string, tx: string) =>
      http().get(`/ads/ssv?ad_network=5450213213286189855&ad_unit=1&custom_data=${nonce}&reward_amount=1&reward_item=coins&timestamp=1&transaction_id=${tx}&user_id=${user}&signature=x&key_id=1`);
    let n = 0;
    const tx = () => `ad-tx-${Date.now()}-${n++}`;

    it('pays coins only when the ad network confirms, and only once per ad', async () => {
      const p = await newPlayer(app);
      const start = (await http().post('/ads/rewarded/start').set(bearer(p)).expect(200)).body;
      expect(start).toMatchObject({ userId: p.user.id, coins: 25 });
      expect(start.nonce).toMatch(/^[0-9a-f]{32}$/);
      expect(await coins(p)).toBe(1000); // starting an ad pays nothing
      const t = tx();
      expect((await callback(p.user.id, start.nonce, t).expect(200)).body).toEqual({ ok: true, credited: true });
      expect(await coins(p)).toBe(1025);
      expect((await callback(p.user.id, start.nonce, t).expect(200)).body).toEqual({ ok: true, credited: false });
      expect((await callback(p.user.id, start.nonce, tx()).expect(200)).body.credited).toBe(false); // same ad, new network id
      expect(await coins(p)).toBe(1025);
      expect(await ledger(p, 'AD_REWARD')).toBe(1);
    });

    it('rejects callbacks for unknown ads, other users\' ads, or with missing fields', async () => {
      const a = await newPlayer(app), b = await newPlayer(app);
      const { nonce } = (await http().post('/ads/rewarded/start').set(bearer(a)).expect(200)).body;
      expect((await callback(a.user.id, 'f'.repeat(32), tx()).expect(400)).body.error).toBe('UNKNOWN_AD');
      expect((await callback(b.user.id, nonce, tx()).expect(400)).body.error).toBe('UNKNOWN_AD');
      await http().get(`/ads/ssv?user_id=${a.user.id}&signature=x&key_id=1`).expect(400);
      await http().get('/ads/ssv').expect(400);
      expect(await coins(a)).toBe(1000);
      expect(await coins(b)).toBe(1000);
    });

    it('stops at the daily cap, and the status shows what is left', async () => {
      const p = await newPlayer(app);
      for (let i = 0; i < 10; i++) {
        const { nonce } = (await http().post('/ads/rewarded/start').set(bearer(p)).expect(200)).body;
        await callback(p.user.id, nonce, tx()).expect(200);
      }
      expect(await coins(p)).toBe(1250);
      const r = await http().post('/ads/rewarded/start').set(bearer(p)).expect(429);
      expect(r.body.error).toBe('AD_LIMIT_REACHED');
      const st = (await http().get('/rewards').set(bearer(p)).expect(200)).body.ads;
      expect(st).toEqual({ coinsPerAd: 25, dailyCap: 10, watchedToday: 10, remainingToday: 0 });
    });

    it('never goes over the cap even if many callbacks land at once', async () => {
      const p = await newPlayer(app);
      const day = app.get(EconomyService).dayOf();
      const nonces = Array.from({ length: 14 }, (_, i) => `${i.toString(16).padStart(2, '0')}${p.user.id.replace(/-/g, '')}`.slice(0, 32));
      await prismaOf(app).adView.createMany({ data: nonces.map((nonce) => ({ userId: p.user.id, nonce, day })) });
      const rs = await Promise.all(nonces.map((nonce) => callback(p.user.id, nonce, tx())));
      expect(rs.every((r) => r.status === 200)).toBe(true);
      expect(await coins(p)).toBe(1000 + 10 * 25);
      expect(await ledger(p, 'AD_REWARD')).toBe(10);
    });

    it('lets an ad expire if the confirmation comes far too late', async () => {
      const p = await newPlayer(app);
      const { nonce } = (await http().post('/ads/rewarded/start').set(bearer(p)).expect(200)).body;
      await prismaOf(app).adView.update({ where: { nonce }, data: { createdAt: new Date(Date.now() - 40 * 60_000) } });
      expect((await callback(p.user.id, nonce, tx()).expect(200)).body.credited).toBe(false);
      expect(await coins(p)).toBe(1000);
      expect((await prismaOf(app).adView.findUniqueOrThrow({ where: { nonce } })).status).toBe('EXPIRED');
    });

    it('counts ads that were started but not finished against the cap for a while', async () => {
      const p = await newPlayer(app);
      for (let i = 0; i < 10; i++) await http().post('/ads/rewarded/start').set(bearer(p)).expect(200);
      await http().post('/ads/rewarded/start').set(bearer(p)).expect(429);
    });

    it('needs a login to start an ad', async () => {
      await http().post('/ads/rewarded/start').expect(401);
    });
  });
});
