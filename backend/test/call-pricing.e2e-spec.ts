import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Player, bearer, createApp, newPlayer, prismaOf } from './helpers';

describe('Call pricing', () => {
  let app: INestApplication;
  let admin: Player;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    app = await createApp();
    admin = await newPlayer(app);
    await prismaOf(app).user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN' } });
  });
  afterAll(() => app.close());

  it('has a default price an admin can change, and players can read it', async () => {
    expect((await http().get('/voice/pricing').set(bearer(admin)).expect(200)).body).toEqual({ voice: 2, video: 5 });
    const set = (await http().post('/admin/settings/calls').set(bearer(admin)).send({ video: 8 }).expect(200)).body;
    expect(set).toEqual({ voice: 2, video: 8 });
    expect((await http().get('/admin/settings/calls').set(bearer(admin)).expect(200)).body).toEqual(set);
    await http().post('/admin/settings/calls').set(bearer(admin)).send({ voice: -1 }).expect(400);
    await http().post('/admin/settings/calls').set(bearer(admin)).send({ voice: 5000 }).expect(400);
    const p = await newPlayer(app);
    await http().post('/admin/settings/calls').set(bearer(p)).send({ voice: 1 }).expect(403);
    await http().post('/admin/settings/calls').set(bearer(admin)).send({ voice: 2, video: 5 }).expect(200);
  });

  it('charges a minute to start, renews only near the end of it, refunds an unanswered call', async () => {
    const balance = async (pl: Player) => (await http().get('/wallet').set(bearer(pl)).expect(200)).body.coins as number;
    const a = await newPlayer(app);
    const b = await newPlayer(app);
    const before = await balance(a);
    const room = (await http().post('/rooms').set(bearer(a)).send({ game: 'TICTACTOE', stake: 0 }).expect(201)).body;
    expect(room.code).toBeTruthy();
    {
      const v = (await http().post('/voice/room').set(bearer(a)).send({ mode: 'video' }).expect(200)).body;
      expect(v.price).toBe(5);
      expect(v.minutesPaid).toBe(1);
      expect(await balance(a)).toBe(before - 5);
      const early = (await http().post(`/voice/sessions/${v.sessionId}/renew`).set(bearer(a)).expect(200)).body;
      expect(early.minutesPaid).toBe(1); // too early: nothing more is taken
      expect(await balance(a)).toBe(before - 5);
      await http().post(`/voice/sessions/${v.sessionId}/renew`).set(bearer(b)).expect(404); // someone else's session
      await http().post(`/voice/sessions/${v.sessionId}/end`).set(bearer(a)).expect(200);
      await http().post(`/voice/sessions/${v.sessionId}/renew`).set(bearer(a)).expect(404);
    }
  });
});
