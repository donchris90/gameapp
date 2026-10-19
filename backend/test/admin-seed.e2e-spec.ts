import request from 'supertest';
import { createApp, newPlayer, prismaOf } from './helpers';

const login = (app: any, identifier: string, password: string) => request(app.getHttpServer()).post('/auth/login').send({ identifier, password });

describe('Admin account from settings', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('creates the admin on start, who can sign in and open the admin API', async () => {
    const email = `boss${Date.now()}@example.com`;
    process.env.ADMIN_EMAIL = email.toUpperCase();
    process.env.ADMIN_PASSWORD = 'a-long-secret-1';
    const app = await createApp();
    try {
      const res = await login(app, email, 'a-long-secret-1').expect(200);
      expect(res.body.user.role).toBe('ADMIN');
      await request(app.getHttpServer()).get('/admin/stats').set('Authorization', `Bearer ${res.body.tokens.accessToken}`).expect(200);
      expect(await prismaOf(app).ledgerEntry.count({ where: { wallet: { user: { email } } } })).toBe(0);
    } finally { await app.close(); }
  });

  it('on the next start promotes an existing player and applies a changed password', async () => {
    const first = await createApp();
    const p = await newPlayer(first);
    await first.close();
    process.env.ADMIN_EMAIL = p.body.email;
    process.env.ADMIN_PASSWORD = 'brand-new-secret-2';
    const app = await createApp();
    try {
      await login(app, p.body.email, p.body.password).expect(401);
      const res = await login(app, p.body.email, 'brand-new-secret-2').expect(200);
      expect(res.body.user.role).toBe('ADMIN');
    } finally { await app.close(); }
  });

  it('ignores weak or half-set values', async () => {
    const email = `weak${Date.now()}@example.com`;
    process.env.ADMIN_EMAIL = email;
    process.env.ADMIN_PASSWORD = 'short';
    const app = await createApp();
    try { expect(await prismaOf(app).user.count({ where: { email } })).toBe(0); } finally { await app.close(); }
  });
});
