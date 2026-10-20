import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Player, bearer, createApp, newPlayer, prismaOf } from './helpers';

describe('Ad policy', () => {
  let app: INestApplication;
  let admin: Player;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    app = await createApp();
    admin = await newPlayer(app);
    await prismaOf(app).user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN' } });
  });
  afterAll(() => app.close());

  it('shows an ad after every game until an admin changes it, and the public games list carries the setting', async () => {
    const g = (await http().get('/games').expect(200)).body;
    expect(g.adEvery).toEqual({ TICTACTOE: 1, WATER_SORT: 1, AYO: 1, LUDO: 1, APEX_RUN: 1 });
    const set = (await http().post('/admin/settings/ads').set(bearer(admin)).send({ LUDO: 3, TICTACTOE: 0 }).expect(200)).body;
    expect(set).toEqual({ TICTACTOE: 0, WATER_SORT: 1, AYO: 1, LUDO: 3, APEX_RUN: 1 });
    expect((await http().get('/admin/settings/ads').set(bearer(admin)).expect(200)).body).toEqual(set);
    expect((await http().get('/games').expect(200)).body.adEvery).toEqual(set);
    const audit = await prismaOf(app).auditLog.findFirst({ where: { action: 'SET_AD_POLICY' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.adminId).toBe(admin.user.id);
  });

  it('refuses bad values and ordinary players', async () => {
    await http().post('/admin/settings/ads').set(bearer(admin)).send({ AYO: -1 }).expect(400);
    await http().post('/admin/settings/ads').set(bearer(admin)).send({ AYO: 99 }).expect(400);
    await http().post('/admin/settings/ads').set(bearer(admin)).send({ AYO: 1.5 }).expect(400);
    await http().post('/admin/settings/ads').set(bearer(admin)).send({ CHESS: 2 }).expect(400);
    const p = await newPlayer(app);
    await http().post('/admin/settings/ads').set(bearer(p)).send({ AYO: 2 }).expect(403);
    await http().get('/admin/settings/ads').set(bearer(p)).expect(403);
  });
});
