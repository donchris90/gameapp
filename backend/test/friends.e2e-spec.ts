import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, createApp, newPlayer, prismaOf } from './helpers';

describe('Friends', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  it('every account gets a friend code', async () => {
    const p = await newPlayer(app);
    expect(p.user.friendCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const me = await http().get('/users/me').set(bearer(p)).expect(200);
    expect(me.body.friendCode).toBe(p.user.friendCode);
  });

  it('request by username, receiver accepts, both see each other', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    const sent = await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username.toUpperCase() }).expect(201);
    expect(sent.body.status).toBe('PENDING');

    const inbox = await http().get('/friends/requests').set(bearer(b)).expect(200);
    expect(inbox.body.incoming).toHaveLength(1);
    expect(inbox.body.incoming[0].user.id).toBe(a.user.id);
    const outbox = await http().get('/friends/requests').set(bearer(a)).expect(200);
    expect(outbox.body.outgoing).toHaveLength(1);

    await http().post(`/friends/requests/${sent.body.id}/accept`).set(bearer(a)).expect(404); // sender cannot accept their own
    await http().post(`/friends/requests/${sent.body.id}/accept`).set(bearer(b)).expect(200);
    await http().post(`/friends/requests/${sent.body.id}/accept`).set(bearer(b)).expect(404); // already done

    const la = await http().get('/friends').set(bearer(a)).expect(200);
    const lb = await http().get('/friends').set(bearer(b)).expect(200);
    expect(la.body.map((f: any) => f.id)).toEqual([b.user.id]);
    expect(lb.body.map((f: any) => f.id)).toEqual([a.user.id]);
    expect(la.body[0].online).toBe(false);
    expect(JSON.stringify(la.body)).not.toMatch(/email|passwordHash/);
  });

  it('request by friend code, any letter case', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    const r = await http().post('/friends/requests').set(bearer(a)).send({ friendCode: b.user.friendCode.toLowerCase() }).expect(201);
    expect(r.body.user.id).toBe(b.user.id);
  });

  it('asking someone who already asked you makes you friends', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username }).expect(201);
    const back = await http().post('/friends/requests').set(bearer(b)).send({ username: a.user.username }).expect(201);
    expect(back.body.status).toBe('ACCEPTED');
    expect((await http().get('/friends').set(bearer(a))).body).toHaveLength(1);
  });

  it('two players asking each other at the same instant end up as one accepted friendship', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    const [r1, r2] = await Promise.all([
      http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username }),
      http().post('/friends/requests').set(bearer(b)).send({ username: a.user.username }),
    ]);
    expect([r1.status, r2.status].every((s) => s === 201 || s === 409)).toBe(true);
    const rows = await prismaOf(app).friendship.findMany({ where: { OR: [{ userAId: a.user.id }, { userBId: a.user.id }] } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('ACCEPTED');
  });

  it('rejects duplicates, self, unknown players and ambiguous targets', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username }).expect(201);
    expect((await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username }).expect(409)).body.error).toBe('REQUEST_ALREADY_SENT');
    expect((await http().post('/friends/requests').set(bearer(a)).send({ username: a.user.username }).expect(400)).body.error).toBe('SELF');
    await http().post('/friends/requests').set(bearer(a)).send({ username: 'nobody_here_1' }).expect(404);
    await http().post('/friends/requests').set(bearer(a)).send({ friendCode: 'ZZZZZZZZ' }).expect(404);
    await http().post('/friends/requests').set(bearer(a)).send({}).expect(400);
    await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username, friendCode: b.user.friendCode }).expect(400);
    await http().post('/friends/requests').send({ username: 'x1234' }).expect(401);
  });

  it('refuses a request to someone you are already friends with', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    const r = await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username }).expect(201);
    await http().post(`/friends/requests/${r.body.id}/accept`).set(bearer(b)).expect(200);
    expect((await http().post('/friends/requests').set(bearer(b)).send({ username: a.user.username }).expect(409)).body.error).toBe('ALREADY_FRIENDS');
  });

  it('receiver can decline, sender can cancel, outsiders cannot touch a request', async () => {
    const a = await newPlayer(app), b = await newPlayer(app), c = await newPlayer(app);
    const r1 = await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username }).expect(201);
    await http().delete(`/friends/requests/${r1.body.id}`).set(bearer(c)).expect(404);
    await http().delete(`/friends/requests/${r1.body.id}`).set(bearer(b)).expect(200);
    expect((await http().get('/friends/requests').set(bearer(a))).body.outgoing).toHaveLength(0);

    const r2 = await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username }).expect(201);
    await http().delete(`/friends/requests/${r2.body.id}`).set(bearer(a)).expect(200);
    expect((await http().get('/friends/requests').set(bearer(b))).body.incoming).toHaveLength(0);
  });

  it('removes a friend for both sides', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    const r = await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username }).expect(201);
    await http().post(`/friends/requests/${r.body.id}/accept`).set(bearer(b)).expect(200);
    await http().delete(`/friends/${b.user.id}`).set(bearer(a)).expect(200);
    expect((await http().get('/friends').set(bearer(b))).body).toHaveLength(0);
    await http().delete(`/friends/${b.user.id}`).set(bearer(a)).expect(404);
  });

  it('blocking ends the friendship and makes the blocker unfindable', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    const r = await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username }).expect(201);
    await http().post(`/friends/requests/${r.body.id}/accept`).set(bearer(b)).expect(200);

    await http().post(`/blocks/${b.user.id}`).set(bearer(a)).expect(200);
    expect((await http().get('/friends').set(bearer(a))).body).toHaveLength(0);
    expect((await http().get('/friends').set(bearer(b))).body).toHaveLength(0);
    // the blocked player gets the same answer as for a nonexistent account
    await http().post('/friends/requests').set(bearer(b)).send({ username: a.user.username }).expect(404);
    await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username }).expect(404);
    expect((await http().get(`/friends/search?q=${a.user.username.slice(0, 6)}`).set(bearer(b))).body.map((u: any) => u.id)).not.toContain(a.user.id);
    expect((await http().get('/blocks').set(bearer(a))).body.map((u: any) => u.id)).toEqual([b.user.id]);

    await http().delete(`/blocks/${b.user.id}`).set(bearer(a)).expect(200);
    await http().post('/friends/requests').set(bearer(b)).send({ username: a.user.username }).expect(201);
    await http().post(`/blocks/${a.user.id}`).set(bearer(a)).expect(400);
  });

  it('searches by username prefix, hides yourself, and needs 3 characters', async () => {
    const stamp = `zed_${Date.now().toString(36)}`;
    const a = await newPlayer(app, { username: `${stamp}_a` });
    const b = await newPlayer(app, { username: `${stamp}_b` });
    const prefix = stamp;
    const res = await http().get(`/friends/search?q=${prefix.toUpperCase()}`).set(bearer(a)).expect(200);
    expect(res.body.map((u: any) => u.id)).toEqual([b.user.id]);
    expect(Object.keys(res.body[0]).sort()).toEqual(['displayName', 'id', 'username']);
    await http().get('/friends/search?q=ab').set(bearer(a)).expect(400);
  });
});
