import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MatchmakingService, QUEUE_TIMEOUT_MS } from '../src/matchmaking/matchmaking.service';
import { bearer, createApp, newPlayer, setCoins } from './helpers';

describe('Quick match', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  const queue = (p: any, body: Record<string, unknown>) => http().post('/matchmaking/queue').set(bearer(p)).send(body);
  const room = (p: any) => http().get('/rooms/current').set(bearer(p));
  /** Waits for the matcher, which runs just after the queue call returns. */
  async function eventually<T>(fn: () => Promise<T | null>, ms = 3000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error('timed out waiting for match');
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  const roomOf = async (p: any) => eventually(async () => { const r = await room(p); return r.status === 200 ? r.body : null; });

  it('pairs two players with the same game and stake into a started room', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    expect((await queue(a, { game: 'TICTACTOE', stake: 100 }).expect(200)).body.queued).toBe(true);
    await queue(b, { game: 'TICTACTOE', stake: 100 }).expect(200);
    const ra = await roomOf(a), rb = await roomOf(b);
    expect(ra.id).toBe(rb.id);
    expect(ra).toMatchObject({ kind: 'QUICK', status: 'IN_PROGRESS', game: 'TICTACTOE', stake: 100 });
    expect(ra.members.map((m: any) => m.userId).sort()).toEqual([a.user.id, b.user.id].sort());
    expect(ra.members.every((m: any) => m.ready)).toBe(true);
    // both are out of the queue now
    expect((await http().delete('/matchmaking/queue').set(bearer(a)).expect(200)).body.wasQueued).toBe(false);
  });

  it('keeps different stakes and games apart', async () => {
    const a = await newPlayer(app), b = await newPlayer(app), c = await newPlayer(app);
    await queue(a, { game: 'AYO', stake: 50 }).expect(200);
    await queue(b, { game: 'AYO', stake: 100 }).expect(200);
    await queue(c, { game: 'TICTACTOE', stake: 50 }).expect(200);
    await new Promise((r) => setTimeout(r, 200));
    for (const p of [a, b, c]) await room(p).expect(404);
    for (const p of [a, b, c]) await http().delete('/matchmaking/queue').set(bearer(p)).expect(200);
  });

  it('fills a four-player Ludo table only when four are waiting', async () => {
    const ps = await Promise.all([1, 2, 3, 4].map(() => newPlayer(app)));
    for (const p of ps.slice(0, 3)) await queue(p, { game: 'LUDO', stake: 0, size: 4 }).expect(200);
    await new Promise((r) => setTimeout(r, 200));
    await room(ps[0]).expect(404);
    await queue(ps[3], { game: 'LUDO', stake: 0, size: 4 }).expect(200);
    const r = await roomOf(ps[0]);
    expect(r.members).toHaveLength(4);
    expect(r.maxPlayers).toBe(4);
  });

  it('forms several tables from one crowd', async () => {
    const ps = await Promise.all(Array.from({ length: 6 }, () => newPlayer(app)));
    await Promise.all(ps.map((p) => queue(p, { game: 'AYO', stake: 0 }).expect(200)));
    const rooms = await Promise.all(ps.map((p) => roomOf(p)));
    expect(new Set(rooms.map((r) => r.id)).size).toBe(3);
    for (const r of rooms) expect(r.members).toHaveLength(2);
  });

  it('never pairs players where one has blocked the other', async () => {
    const a = await newPlayer(app), b = await newPlayer(app), c = await newPlayer(app);
    await http().post(`/blocks/${b.user.id}`).set(bearer(a)).expect(200);
    await queue(a, { game: 'TICTACTOE', stake: 0 }).expect(200);
    await queue(b, { game: 'TICTACTOE', stake: 0 }).expect(200);
    await new Promise((r) => setTimeout(r, 200));
    await room(a).expect(404);
    await queue(c, { game: 'TICTACTOE', stake: 0 }).expect(200);
    const ra = await roomOf(a);
    expect(ra.members.map((m: any) => m.userId).sort()).toEqual([a.user.id, c.user.id].sort());
    await room(b).expect(404);
    await http().delete('/matchmaking/queue').set(bearer(b)).expect(200);
  });

  it('checks the stake, the table size and double-queueing', async () => {
    const poor = await newPlayer(app), p = await newPlayer(app);
    await setCoins(app, poor.user.id, 10);
    expect((await queue(poor, { game: 'TICTACTOE', stake: 50 }).expect(402)).body.error).toBe('INSUFFICIENT_COINS');
    expect((await queue(p, { game: 'TICTACTOE', stake: 33 }).expect(400)).body.error).toBe('BAD_STAKE');
    expect((await queue(p, { game: 'TICTACTOE', stake: 0, size: 4 }).expect(400)).body.error).toBe('BAD_PLAYER_COUNT');
    await queue(p, { game: 'TICTACTOE', stake: 0 }).expect(200);
    expect((await queue(p, { game: 'AYO', stake: 0 }).expect(409)).body.error).toBe('ALREADY_QUEUED');
    expect((await http().delete('/matchmaking/queue').set(bearer(p)).expect(200)).body.wasQueued).toBe(true);
  });

  it('will not queue someone who is already in a room', async () => {
    const p = await newPlayer(app);
    await http().post('/rooms').set(bearer(p)).send({ game: 'TICTACTOE', stake: 0 }).expect(201);
    expect((await queue(p, { game: 'TICTACTOE', stake: 0 }).expect(409)).body.error).toBe('ALREADY_IN_ROOM');
  });

  it('drops a queued player who joined a room meanwhile and keeps the other waiting', async () => {
    const a = await newPlayer(app), b = await newPlayer(app), c = await newPlayer(app);
    await queue(a, { game: 'TICTACTOE', stake: 0 }).expect(200);
    await http().post('/rooms').set(bearer(a)).send({ game: 'AYO', stake: 0 }).expect(201); // a goes elsewhere
    await queue(b, { game: 'TICTACTOE', stake: 0 }).expect(200);
    await new Promise((r) => setTimeout(r, 250));
    await room(b).expect(404); // b is still waiting, not stuck
    await queue(c, { game: 'TICTACTOE', stake: 0 }).expect(200);
    const rb = await roomOf(b);
    expect(rb.members.map((m: any) => m.userId).sort()).toEqual([b.user.id, c.user.id].sort());
    expect((await room(a).expect(200)).body.game).toBe('AYO');
  });

  it('takes players out of the queue after the timeout', async () => {
    const p = await newPlayer(app);
    await queue(p, { game: 'AYO', stake: 0 }).expect(200);
    const mm = app.get(MatchmakingService);
    mm.sweepTimeouts(Date.now() + QUEUE_TIMEOUT_MS + 1000);
    expect(mm.queuedKey(p.user.id)).toBeNull();
    await queue(p, { game: 'AYO', stake: 0 }).expect(200); // can queue again
    await http().delete('/matchmaking/queue').set(bearer(p)).expect(200);
  });
});
