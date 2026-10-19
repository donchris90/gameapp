import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, befriend, createApp, newPlayer, prismaOf } from './helpers';

describe('Account deletion', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  it('needs the right password, then erases the account and signs the player out', async () => {
    const p = await newPlayer(app);
    const friend = await newPlayer(app);
    await befriend(app, p, friend);
    await http().post('/users/me/delete').set(bearer(p)).send({ password: 'wrong-password' }).expect(403);
    await http().post('/users/me/delete').set(bearer(p)).send({ password: p.body.password }).expect(200);

    await http().get('/users/me').set(bearer(p)).expect(403);
    await http().post('/auth/refresh').send({ refreshToken: p.tokens.refreshToken }).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    await http().post('/auth/login').send({ identifier: p.body.email, password: p.body.password }).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    const row = await prismaOf(app).user.findUniqueOrThrow({ where: { id: p.user.id } });
    expect(row.status).toBe('DELETED');
    expect(row.email).not.toBe(p.body.email);
    expect(row.displayName).toBe('Deleted player');
    const mine = await http().get('/friends').set(bearer(friend)).expect(200);
    expect(JSON.stringify(mine.body)).not.toContain(p.user.id);
    // the email can be used again for a new account
    await http().post('/auth/register').send({ email: p.body.email, username: 'fresh' + Date.now().toString(36), password: p.body.password, birthDate: '1995-01-01', confirmAdult: true, acceptTerms: true }).expect(201);
  });
});
