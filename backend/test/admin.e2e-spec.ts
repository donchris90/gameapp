import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Player, bearer, createApp, newPlayer, prismaOf } from './helpers';

describe('Admin', () => {
  let app: INestApplication;
  let admin: Player;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    app = await createApp();
    admin = await newPlayer(app);
    await prismaOf(app).user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN' } });
  });
  afterAll(() => app.close());
  const coins = async (p: Player) => (await http().get('/wallet').set(bearer(p)).expect(200)).body.coins as number;

  it('is closed to everyone but admins', async () => {
    const p = await newPlayer(app);
    for (const path of ['/admin/stats', '/admin/users', '/admin/matches', '/admin/purchases', '/admin/audit', `/admin/users/${p.user.id}`]) {
      await http().get(path).expect(401);
      await http().get(path).set(bearer(p)).expect(403);
    }
    await http().post(`/admin/users/${p.user.id}/adjust`).set(bearer(p)).send({ amount: 1000000, reason: 'give me coins' }).expect(403);
    expect(await coins(p)).toBe(1000);
  });

  it('shows the numbers that matter', async () => {
    const s = (await http().get('/admin/stats').set(bearer(admin)).expect(200)).body;
    expect(s.users.total).toBeGreaterThan(0);
    expect(s.users.byStatus.ACTIVE).toBeGreaterThan(0);
    expect(s.coins.inCirculation).toBeGreaterThan(0);
    expect(s).toMatchObject({ matches: { activeNow: expect.any(Number), today: expect.any(Number) }, purchases: { today: expect.any(Number) } });
    expect(typeof s.coins.houseFeeAllTime).toBe('number');
  });

  it('finds players by username, email or friend code and pages through them', async () => {
    const p = await newPlayer(app);
    const byName = (await http().get(`/admin/users?q=${p.user.username.slice(0, 6)}`).set(bearer(admin)).expect(200)).body;
    expect(byName.users.some((u: any) => u.id === p.user.id)).toBe(true);
    const byEmail = (await http().get(`/admin/users?q=${encodeURIComponent(p.user.email)}`).set(bearer(admin)).expect(200)).body;
    expect(byEmail.users.map((u: any) => u.id)).toContain(p.user.id);
    const byCode = (await http().get(`/admin/users?q=${p.user.friendCode.toLowerCase()}`).set(bearer(admin)).expect(200)).body;
    expect(byCode.users.map((u: any) => u.id)).toContain(p.user.id);
    const page1 = (await http().get('/admin/users?limit=2').set(bearer(admin)).expect(200)).body;
    expect(page1.users).toHaveLength(2);
    const page2 = (await http().get(`/admin/users?limit=2&cursor=${page1.nextCursor}`).set(bearer(admin)).expect(200)).body;
    expect(page2.users[0].id).not.toBe(page1.users[0].id);
    expect(page1.users[0]).not.toHaveProperty('passwordHash');
  });

  it('shows everything about one player', async () => {
    const p = await newPlayer(app);
    const d = (await http().get(`/admin/users/${p.user.id}`).set(bearer(admin)).expect(200)).body;
    expect(d.user).toMatchObject({ id: p.user.id, coins: 1000, status: 'ACTIVE', role: 'USER' });
    expect(d.user).not.toHaveProperty('passwordHash');
    expect(d.ledger[0]).toMatchObject({ type: 'SIGNUP_BONUS', amount: 1000, balanceAfter: 1000 });
    await http().get('/admin/users/not-a-uuid').set(bearer(admin)).expect(400);
    await http().get('/admin/users/2f0f7a0e-1111-4222-8333-444455556666').set(bearer(admin)).expect(404);
  });

  describe('adjusting coins', () => {
    it('adds and removes coins with a ledger entry and an audit record', async () => {
      const p = await newPlayer(app);
      expect((await http().post(`/admin/users/${p.user.id}/adjust`).set(bearer(admin)).send({ amount: 500, reason: 'Support refund' }).expect(200)).body).toEqual({ balance: 1500 });
      expect((await http().post(`/admin/users/${p.user.id}/adjust`).set(bearer(admin)).send({ amount: -200, reason: 'Fraud correction' }).expect(200)).body).toEqual({ balance: 1300 });
      expect(await coins(p)).toBe(1300);
      const d = (await http().get(`/admin/users/${p.user.id}`).set(bearer(admin)).expect(200)).body;
      expect(d.ledger.filter((e: any) => e.type === 'ADJUSTMENT').map((e: any) => e.amount).sort()).toEqual([-200, 500]);
      expect(d.audits.map((a: any) => a.data.reason).sort()).toEqual(['Fraud correction', 'Support refund']);
      expect(d.audits[0].by).toBe(admin.user.username);
      const log = (await http().get('/admin/audit?limit=5').set(bearer(admin)).expect(200)).body.entries;
      expect(log[0]).toMatchObject({ action: 'ADJUST_COINS', admin: admin.user.username, target: p.user.username });
    });

    it('cannot take more than the player has, and rejects bad amounts', async () => {
      const p = await newPlayer(app);
      expect((await http().post(`/admin/users/${p.user.id}/adjust`).set(bearer(admin)).send({ amount: -5000, reason: 'too much' }).expect(402)).body.error).toBe('INSUFFICIENT_COINS');
      expect(await coins(p)).toBe(1000);
      for (const body of [{ amount: 0, reason: 'nothing' }, { amount: 1.5, reason: 'half coin' }, { amount: 99999999, reason: 'huge' }, { amount: 5 }, { amount: 5, reason: 'x' }]) {
        await http().post(`/admin/users/${p.user.id}/adjust`).set(bearer(admin)).send(body).expect(400);
      }
      await http().post('/admin/users/2f0f7a0e-1111-4222-8333-444455556666/adjust').set(bearer(admin)).send({ amount: 5, reason: 'ghost user' }).expect(404);
      const audits = await prismaOf(app).auditLog.count({ where: { targetUserId: p.user.id } });
      expect(audits).toBe(0); // failed attempts leave no half-written records
    });
  });

  describe('suspending and banning', () => {
    it('locks the player out at once and ends their login sessions', async () => {
      const p = await newPlayer(app);
      await http().get('/wallet').set(bearer(p)).expect(200);
      await http().post(`/admin/users/${p.user.id}/status`).set(bearer(admin)).send({ status: 'BANNED', reason: 'Cheating' }).expect(200);
      await http().get('/wallet').set(bearer(p)).expect(403);
      await http().post('/auth/refresh').send({ refreshToken: p.tokens.refreshToken }).expect(401);
      await http().post('/auth/login').send({ identifier: p.user.email, password: p.body.password }).expect(403);
      const log = (await http().get('/admin/audit?limit=1').set(bearer(admin)).expect(200)).body.entries[0];
      expect(log).toMatchObject({ action: 'SET_STATUS', data: { from: 'ACTIVE', to: 'BANNED', reason: 'Cheating' } });
    });

    it('lets the player back in when reactivated', async () => {
      const p = await newPlayer(app);
      await http().post(`/admin/users/${p.user.id}/status`).set(bearer(admin)).send({ status: 'SUSPENDED', reason: 'Cooling off' }).expect(200);
      await http().post(`/admin/users/${p.user.id}/status`).set(bearer(admin)).send({ status: 'ACTIVE', reason: 'Appeal accepted' }).expect(200);
      await http().post('/auth/login').send({ identifier: p.user.email, password: p.body.password }).expect(200);
    });

    it('protects admins and yourself, and checks the input', async () => {
      const other = await newPlayer(app);
      await prismaOf(app).user.update({ where: { id: other.user.id }, data: { role: 'ADMIN' } });
      expect((await http().post(`/admin/users/${admin.user.id}/status`).set(bearer(admin)).send({ status: 'BANNED', reason: 'oops' }).expect(400)).body.error).toBe('SELF');
      expect((await http().post(`/admin/users/${other.user.id}/status`).set(bearer(admin)).send({ status: 'BANNED', reason: 'coup' }).expect(403)).body.error).toBe('IS_ADMIN');
      const p = await newPlayer(app);
      await http().post(`/admin/users/${p.user.id}/status`).set(bearer(admin)).send({ status: 'DELETED', reason: 'whatever' }).expect(400);
      await http().post(`/admin/users/${p.user.id}/status`).set(bearer(admin)).send({ status: 'BANNED' }).expect(400);
    });
  });

  it('lists matches and purchases', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    const room = (await http().post('/rooms').set(bearer(a)).send({ game: 'TICTACTOE', stake: 100 }).expect(201)).body;
    await http().post('/rooms/join').set(bearer(b)).send({ code: room.code }).expect(200);
    await http().post('/rooms/current/ready').set(bearer(b)).send({ ready: true }).expect(200);
    await http().post('/rooms/current/start').set(bearer(a)).expect(200);
    const active = (await http().get('/admin/matches?status=ACTIVE').set(bearer(admin)).expect(200)).body.matches;
    const m = active.find((x: any) => x.players.some((p: any) => p.userId === a.user.id));
    expect(m).toMatchObject({ game: 'TICTACTOE', stake: 100, pot: 200, status: 'ACTIVE' });
    await http().post('/store/purchases').set(bearer(a)).send({ platform: 'GOOGLE', productId: 'coins_500', token: 'fake:admin-test-1:coins_500' }).expect(200);
    const pur = (await http().get('/admin/purchases?limit=5').set(bearer(admin)).expect(200)).body.purchases;
    expect(pur.find((x: any) => x.transactionId === 'admin-test-1')).toMatchObject({ username: a.user.username, coins: 500, platform: 'GOOGLE' });
    const all = (await http().get('/admin/matches?limit=3').set(bearer(admin)).expect(200)).body;
    expect(all.matches.length).toBeGreaterThan(0);
  });
});
