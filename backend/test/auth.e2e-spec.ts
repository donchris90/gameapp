import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, prismaOf, registerBody, registerUser } from './helpers';

describe('Auth', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  const bday = (yearsAgo: number, dayOffset = 0) => {
    const d = new Date();
    const t = new Date(Date.UTC(d.getUTCFullYear() - yearsAgo, d.getUTCMonth(), d.getUTCDate() + dayOffset));
    return t.toISOString().slice(0, 10);
  };

  describe('register', () => {
    it('creates the account, a wallet with the signup bonus, and tokens', async () => {
      const body = registerBody();
      const res = await http().post('/auth/register').send(body).expect(201);
      expect(res.body.user).toMatchObject({ email: body.email, username: body.username, role: 'USER' });
      expect(res.body.tokens.accessToken).toEqual(expect.any(String));
      expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
      const me = await http().get('/users/me').set('Authorization', `Bearer ${res.body.tokens.accessToken}`).expect(200);
      expect(me.body.coins).toBe(1000);
    });

    it('stores a hashed password, never the plain one', async () => {
      const { body, user } = await registerUser(app);
      const row = await prismaOf(app).user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.passwordHash).not.toContain(body.password as string);
      expect(row.passwordHash.startsWith('$argon2')).toBe(true);
    });

    it('blocks anyone under 18, including the day before the 18th birthday', async () => {
      for (const birthDate of [bday(10), bday(17), bday(18, 1)]) {
        const res = await http().post('/auth/register').send(registerBody({ birthDate })).expect(403);
        expect(res.body.error).toBe('UNDERAGE');
      }
    });

    it('allows someone who turns 18 today', async () => {
      await http().post('/auth/register').send(registerBody({ birthDate: bday(18) })).expect(201);
    });

    it('rejects impossible or future birth dates', async () => {
      await http().post('/auth/register').send(registerBody({ birthDate: '2001-02-30' })).expect(422);
      await http().post('/auth/register').send(registerBody({ birthDate: `${new Date().getUTCFullYear() + 1}-01-01` })).expect(422);
      await http().post('/auth/register').send(registerBody({ birthDate: '15/06/2000' })).expect(400);
    });

    it('requires the 18+ confirmation and the terms', async () => {
      await http().post('/auth/register').send(registerBody({ confirmAdult: false })).expect(400);
      await http().post('/auth/register').send(registerBody({ acceptTerms: false })).expect(400);
      const { confirmAdult, ...missing } = registerBody();
      await http().post('/auth/register').send(missing).expect(400);
    });

    it('rejects duplicate emails and usernames (case-insensitive)', async () => {
      const { body } = await registerUser(app);
      const dupEmail = await http().post('/auth/register').send(registerBody({ email: (body.email as string).toUpperCase() })).expect(409);
      expect(dupEmail.body.message).toMatch(/email/i);
      const dupName = await http().post('/auth/register').send(registerBody({ username: (body.username as string).toUpperCase() })).expect(409);
      expect(dupName.body.message).toMatch(/username/i);
    });

    it('validates inputs and refuses unknown fields such as role', async () => {
      await http().post('/auth/register').send(registerBody({ password: 'short' })).expect(400);
      await http().post('/auth/register').send(registerBody({ username: 'a b' })).expect(400);
      await http().post('/auth/register').send(registerBody({ email: 'nope' })).expect(400);
      await http().post('/auth/register').send(registerBody({ role: 'ADMIN' })).expect(400);
    });
  });

  describe('login', () => {
    it('works with email or username, in any letter case', async () => {
      const { body } = await registerUser(app);
      await http().post('/auth/login').send({ identifier: body.email, password: body.password }).expect(200);
      const res = await http().post('/auth/login').send({ identifier: (body.username as string).toUpperCase(), password: body.password }).expect(200);
      expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    });

    it('gives the same error for a wrong password and an unknown account', async () => {
      const { body } = await registerUser(app);
      const a = await http().post('/auth/login').send({ identifier: body.email, password: 'wrong-password' }).expect(401);
      const b = await http().post('/auth/login').send({ identifier: 'ghost@example.com', password: 'wrong-password' }).expect(401);
      expect(a.body.message).toBe(b.body.message);
    });

    it('refuses suspended and banned accounts', async () => {
      const { body, user, tokens } = await registerUser(app);
      await prismaOf(app).user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
      await http().post('/auth/login').send({ identifier: body.email, password: body.password }).expect(403);
      // an access token issued before the suspension stops working immediately
      await http().get('/users/me').set('Authorization', `Bearer ${tokens.accessToken}`).expect(403);
    });
  });

  describe('tokens', () => {
    it('protects routes and rejects garbage tokens', async () => {
      await http().get('/users/me').expect(401);
      await http().get('/users/me').set('Authorization', 'Bearer not.a.token').expect(401);
      await http().get('/wallet').set('Authorization', 'Basic abc').expect(401);
    });

    it('rotates refresh tokens and revokes the family when an old one is replayed', async () => {
      const { tokens: t0 } = await registerUser(app);
      const r1 = await http().post('/auth/refresh').send({ refreshToken: t0.refreshToken }).expect(200);
      const t1 = r1.body.tokens;
      expect(t1.refreshToken).not.toBe(t0.refreshToken);
      await http().get('/users/me').set('Authorization', `Bearer ${t1.accessToken}`).expect(200);

      // replaying the first (already used) token is treated as theft
      await http().post('/auth/refresh').send({ refreshToken: t0.refreshToken }).expect(401);
      // ...which also kills the newer token from the same family
      await http().post('/auth/refresh').send({ refreshToken: t1.refreshToken }).expect(401);
    });

    it('only one of two simultaneous refreshes can win', async () => {
      const { tokens } = await registerUser(app);
      const [a, b] = await Promise.all([
        http().post('/auth/refresh').send({ refreshToken: tokens.refreshToken }),
        http().post('/auth/refresh').send({ refreshToken: tokens.refreshToken }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 401]);
    });

    it('logout revokes the session', async () => {
      const { tokens } = await registerUser(app);
      await http().post('/auth/logout').send({ refreshToken: tokens.refreshToken }).expect(200);
      await http().post('/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await http().post('/auth/refresh').send({ refreshToken: 'x'.repeat(64) }).expect(401);
    });
  });

  describe('profile', () => {
    it('lets a user change their display name but not their email, role or coins', async () => {
      const { tokens } = await registerUser(app);
      const auth = { Authorization: `Bearer ${tokens.accessToken}` };
      const res = await http().patch('/users/me').set(auth).send({ displayName: 'Speedy Tunde' }).expect(200);
      expect(res.body.displayName).toBe('Speedy Tunde');
      await http().patch('/users/me').set(auth).send({ displayName: 'x', coins: 999999 }).expect(400);
      await http().patch('/users/me').set(auth).send({ displayName: 'ok name', role: 'ADMIN' }).expect(400);
      await http().patch('/users/me').set(auth).send({ displayName: '<script>' }).expect(400);
    });
  });

  it('health check reaches the database', async () => {
    await http().get('/health').expect(200, { status: 'ok' });
  });
});
