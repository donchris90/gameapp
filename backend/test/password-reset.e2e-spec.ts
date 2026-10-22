import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, prismaOf, registerUser } from './helpers';
import { currentWindow, resetCode } from '../src/auth/reset-code';

describe('Forgot password', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  it('answers the same for a known and an unknown email', async () => {
    const u = await registerUser(app);
    expect((await http().post('/auth/forgot').send({ email: u.body.email }).expect(200)).body).toEqual({ ok: true });
    expect((await http().post('/auth/forgot').send({ email: 'nobody-here@example.com' }).expect(200)).body).toEqual({ ok: true });
  });

  it('resets the password with the emailed code, signs out other devices, and the code works once', async () => {
    const u = await registerUser(app);
    const row = await prismaOf(app).user.findUniqueOrThrow({ where: { id: u.user.id } });
    const code = resetCode(process.env.JWT_ACCESS_SECRET!, row.id, row.passwordHash, currentWindow());
    await http().post('/auth/reset').send({ email: u.body.email, code: code === '000000' ? '111111' : '000000', newPassword: 'a brand new pass' }).expect(400);
    await http().post('/auth/reset').send({ email: u.body.email, code, newPassword: 'short' }).expect(400);
    await http().post('/auth/reset').send({ email: u.body.email, code, newPassword: 'a brand new pass' }).expect(200);
    await http().post('/auth/login').send({ identifier: u.body.email, password: u.body.password }).expect(401);
    await http().post('/auth/login').send({ identifier: u.body.email, password: 'a brand new pass' }).expect(200);
    await http().post('/auth/refresh').send({ refreshToken: u.tokens.refreshToken }).expect(401);
    await http().post('/auth/reset').send({ email: u.body.email, code, newPassword: 'another new pass' }).expect(400); // used
  });

  it('locks an email after five wrong codes', async () => {
    const u = await registerUser(app);
    for (let i = 0; i < 5; i++) await http().post('/auth/reset').send({ email: u.body.email, code: '123456', newPassword: 'whatever long' }).expect(400);
    const row = await prismaOf(app).user.findUniqueOrThrow({ where: { id: u.user.id } });
    const code = resetCode(process.env.JWT_ACCESS_SECRET!, row.id, row.passwordHash, currentWindow());
    await http().post('/auth/reset').send({ email: u.body.email, code, newPassword: 'whatever long' }).expect(400);
  });
});
