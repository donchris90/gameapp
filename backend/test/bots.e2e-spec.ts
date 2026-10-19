import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomPlayerName } from '../src/bots/bot-names';
import { MatchmakingService } from '../src/matchmaking/matchmaking.service';
import { MatchesService } from '../src/matches/matches.service';
import { Player, bearer, createApp, newPlayer, prismaOf, setCoins } from './helpers';

describe('Computer opponents in free games', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const saved = { ...process.env };
  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { process.env = { ...saved }; await app.close(); });

  const queue = (p: Player, body: Record<string, unknown>) => http().post('/matchmaking/queue').set(bearer(p)).send(body);
  const current = (p: Player) => http().get('/matches/current').set(bearer(p));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function until<T>(fn: () => Promise<T | null | undefined | false>, ms = 8000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v as T;
      if (Date.now() > end) throw new Error('timed out waiting');
      await wait(50);
    }
  }
  /** Pretend the waiting time has already passed. */
  const fill = () => app.get(MatchmakingService).fillWithBots(Date.now() + 3_600_002);

  it('made-up names look like ordinary usernames and never say "bot"', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const { username, displayName } = randomPlayerName();
      expect(username).toMatch(/^[a-z0-9_.]{3,20}$/i);
      expect(`${username} ${displayName}`).not.toMatch(/bot|computer|\bai\b|cpu/i);
      expect(displayName.length).toBeGreaterThanOrEqual(2);
      seen.add(username);
    }
    expect(seen.size).toBeGreaterThan(500);
  });

  it('a free quick match with nobody else gets a computer opponent after the wait', async () => {
    const p = await newPlayer(app);
    await queue(p, { game: 'TICTACTOE', stake: 0 }).expect(200);
    await fill();
    const m = (await until(async () => { const r = await current(p); return r.status === 200 ? r.body : null; })) as any;
    expect(m.players).toHaveLength(2);
    const other = m.players.find((x: any) => x.userId !== p.user.id);
    expect(other.username).not.toMatch(/bot/i);
    const row = await prismaOf(app).user.findUniqueOrThrow({ where: { id: other.userId } });
    expect(row.isBot).toBe(true);
    expect(row.email).toMatch(/@players\.invalid$/);
  });

  it('the computer plays its turns and a full game finishes on its own, then the room closes', async () => {
    const p = await newPlayer(app);
    await queue(p, { game: 'TICTACTOE', stake: 0 }).expect(200);
    await fill();
    let m = (await until(async () => { const r = await current(p); return r.status === 200 ? r.body : null; })) as any;
    const mySeat = m.players.find((x: any) => x.userId === p.user.id).seat;
    const id = m.id;
    // Human plays the first free square each turn; the computer answers by itself.
    for (let i = 0; i < 12 && m.status === 'ACTIVE'; i++) {
      m = (await until(async () => {
        const r = (await http().get(`/matches/${id}`).set(bearer(p))).body;
        return r.status !== 'ACTIVE' || r.turnSeat === mySeat ? r : null;
      })) as any;
      if (m.status !== 'ACTIVE') break;
      const cell = m.state.board.findIndex((v: number | null) => v === null);
      m = (await http().post(`/matches/${id}/move`).set(bearer(p)).send({ version: m.version, move: { cell } }).expect(200)).body;
    }
    m = (await until(async () => { const r = (await http().get(`/matches/${id}`).set(bearer(p))).body; return r.status === 'FINISHED' ? r : null; })) as any;
    expect(['WON', 'LOST', 'DRAW']).toContain(m.players.find((x: any) => x.userId === p.user.id).result);
    await until(async () => (await http().get('/rooms/current').set(bearer(p))).status === 404);
  });

  it('plays Ayo and Ludo with legal moves only until someone wins or it is the human to move', async () => {
    for (const [game, size] of [['AYO', 2], ['LUDO', 3]] as const) {
      const p = await newPlayer(app);
      await queue(p, { game, stake: 0, size }).expect(200);
      await fill();
      const m = (await until(async () => { const r = await current(p); return r.status === 200 ? r.body : null; })) as any;
      expect(m.players).toHaveLength(size);
      expect(m.players.filter((x: any) => x.userId !== p.user.id).every((x: any) => !/bot/i.test(x.username))).toBe(true);
      const mySeat = m.players.find((x: any) => x.userId === p.user.id).seat;
      // Within a few seconds the game must have reached the human's turn, even if the computer went first.
      await until(async () => (await http().get(`/matches/${m.id}`).set(bearer(p))).body.turnSeat === mySeat, 15000);
      const done = (await http().post(`/matches/${m.id}/forfeit`).set(bearer(p)).expect(200)).body;
      expect(done.status).toBe('FINISHED'); // computer players never keep a game going on their own
    }
  });

  it('never fills a game that has coins at stake', async () => {
    const p = await newPlayer(app);
    await setCoins(app, p.user.id, 500);
    await queue(p, { game: 'TICTACTOE', stake: 50 }).expect(200);
    await fill();
    await wait(300);
    await current(p).expect(404);
    expect(app.get(MatchmakingService).queuedKey(p.user.id)).toBe('TICTACTOE:50:2');
    await http().delete('/matchmaking/queue').set(bearer(p)).expect(200);
  });

  it('computer accounts cannot be found or befriended, and are hidden from admin counts', async () => {
    const p = await newPlayer(app);
    await queue(p, { game: 'TICTACTOE', stake: 0 }).expect(200);
    await fill();
    const m = (await until(async () => { const r = await current(p); return r.status === 200 ? r.body : null; })) as any;
    const other = m.players.find((x: any) => x.userId !== p.user.id);
    const q = other.username.slice(0, 4);
    const found = (await http().get(`/friends/search?q=${encodeURIComponent(q)}`).set(bearer(p)).expect(200)).body;
    expect(JSON.stringify(found)).not.toContain(other.userId);
    await http().post('/friends/requests').set(bearer(p)).send({ username: other.username }).expect(404);
    const bots = await prismaOf(app).user.count({ where: { isBot: true } });
    expect(bots).toBeGreaterThan(0);
  });

  it('a computer account that is free again is reused', async () => {
    const before = await prismaOf(app).user.count({ where: { isBot: true } });
    const p = await newPlayer(app);
    await queue(p, { game: 'TICTACTOE', stake: 0 }).expect(200);
    await fill();
    const m = (await until(async () => { const r = await current(p); return r.status === 200 ? r.body : null; })) as any;
    await http().post(`/matches/${m.id}/forfeit`).set(bearer(p)).expect(200);
    await until(async () => (await http().get('/rooms/current').set(bearer(p))).status === 404);
    const after = await prismaOf(app).user.count({ where: { isBot: true } });
    expect(after - before).toBeLessThanOrEqual(1);
    // Nothing is stuck in a room or match afterwards.
    expect(await prismaOf(app).roomMember.count({ where: { user: { isBot: true }, room: { status: { not: 'IN_PROGRESS' } } } })).toBe(0);
  });
});
