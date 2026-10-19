import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { RoomsService } from '../src/rooms/rooms.service';
import { Player, bearer, befriend, createApp, newPlayer, prismaOf } from './helpers';

describe('Social', () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AGORA_APP_ID = '0123456789abcdef0123456789abcdef';
    process.env.AGORA_APP_CERTIFICATE = 'fedcba9876543210fedcba9876543210';
    app = await createApp();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as any).port}`;
  });
  afterAll(async () => { sockets.forEach((s) => s.close()); await app.close(); });

  function connect(p: Player): Promise<Socket> {
    const s = io(url, { auth: { token: p.tokens.accessToken }, transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    return new Promise((resolve, reject) => { s.once('ready', () => resolve(s)); s.once('connect_error', reject); setTimeout(() => reject(new Error('connect timeout')), 4000); });
  }
  const next = <T = any>(s: Socket, event: string, ms = 3000) => new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    s.once(event, (p: T) => { clearTimeout(t); resolve(p); });
  });
  const ack = (s: Socket, event: string, body: unknown) => new Promise<any>((resolve) => s.emit(event, body, resolve));

  /** Two humans play a friendly Tic Tac Toe game to the end (set directly in the database) and land back in the room. */
  async function finishedGame(winner: 'a' | 'b' = 'a') {
    const a = await newPlayer(app), b = await newPlayer(app);
    const room = (await http().post('/rooms').set(bearer(a)).send({ game: 'TICTACTOE', stake: 0 }).expect(201)).body;
    await http().post('/rooms/join').set(bearer(b)).send({ code: room.code }).expect(200);
    await http().post('/rooms/current/ready').set(bearer(b)).send({ ready: true }).expect(200);
    await http().post('/rooms/current/start').set(bearer(a)).expect(200);
    const match = (await http().get('/matches/current').set(bearer(a)).expect(200)).body;
    const db = prismaOf(app);
    await db.match.update({ where: { id: match.id }, data: { status: 'FINISHED', finishedAt: new Date(), winnerId: winner === 'a' ? a.user.id : b.user.id } });
    await db.matchPlayer.update({ where: { matchId_userId: { matchId: match.id, userId: a.user.id } }, data: { result: winner === 'a' ? 'WON' : 'LOST' } });
    await db.matchPlayer.update({ where: { matchId_userId: { matchId: match.id, userId: b.user.id } }, data: { result: winner === 'a' ? 'LOST' : 'WON' } });
    await app.get(RoomsService).finishGame(room.id);
    return { a, b, match, room };
  }

  it('shows a public profile with stats, and hides blocked players and computers', async () => {
    const { a, b } = await finishedGame('a');
    const p = (await http().get(`/players/${a.user.id}`).set(bearer(b)).expect(200)).body;
    expect(p).toMatchObject({ id: a.user.id, username: a.user.username, relation: 'none', totals: { played: 1, won: 1, winRate: 100 } });
    expect(p.games.find((g: any) => g.game === 'TICTACTOE')).toMatchObject({ played: 1, won: 1 });
    expect(JSON.stringify(p)).not.toMatch(/email|passwordHash|friendCode/);
    expect((await http().get(`/players/${b.user.id}`).set(bearer(b)).expect(200)).body.relation).toBe('self');
    await befriend(app, a, b);
    expect((await http().get(`/players/${a.user.id}`).set(bearer(b)).expect(200)).body.relation).toBe('friend');
    await http().post(`/blocks/${a.user.id}`).set(bearer(b)).expect(200);
    expect((await http().get(`/players/${a.user.id}`).set(bearer(b)).expect(404)).body.error).toBe('PLAYER_NOT_FOUND');
    const bot = await prismaOf(app).user.findFirst({ where: { isBot: true } });
    if (bot) await http().get(`/players/${bot.id}`).set(bearer(b)).expect(404);
  });

  it('ranks players by wins against real people, this week and all time, with my own rank', async () => {
    const { a, b } = await finishedGame('a');
    const lb = (await http().get('/leaderboard?period=all').set(bearer(b)).expect(200)).body;
    const mineAll = (await http().get('/leaderboard?period=all').set(bearer(a)).expect(200)).body;
    expect(mineAll.me.wins).toBeGreaterThanOrEqual(1);
    expect(mineAll.me.rank).toBeGreaterThanOrEqual(1);
    expect(lb.top.length).toBeLessThanOrEqual(25);
    expect(lb.top[0].wins).toBeGreaterThanOrEqual(lb.top[lb.top.length - 1].wins);
    expect(lb.me).toEqual({ rank: null, wins: 0 }); // b has not won anything
    const mine = (await http().get('/leaderboard?period=week&game=TICTACTOE').set(bearer(a)).expect(200)).body;
    expect(mine.me.wins).toBeGreaterThanOrEqual(1);
    // an old win does not count for the week
    await prismaOf(app).match.updateMany({ where: { players: { some: { userId: a.user.id } } }, data: { finishedAt: new Date(Date.now() - 10 * 86_400_000) } });
    expect((await http().get('/leaderboard?period=week').set(bearer(a)).expect(200)).body.me.wins).toBe(0);
    await http().get('/leaderboard?period=year').set(bearer(a)).expect(400);
    await http().get('/leaderboard?game=CHESS').set(bearer(a)).expect(400);
  });

  it('wins against the computer never reach the leaderboard', async () => {
    const a = await newPlayer(app);
    const bot = await prismaOf(app).user.findFirst({ where: { isBot: true } }) ?? await prismaOf(app).user.create({ data: { email: `bot${Date.now()}@players.invalid`, username: `Bot${Date.now()}`, usernameLower: `bot${Date.now()}`, friendCode: `B${Date.now()}`.slice(0, 8), displayName: 'Chidi Okafor', passwordHash: 'x', birthDate: new Date('1990-01-01'), ageConfirmedAt: new Date(), termsAcceptedAt: new Date(), isBot: true } });
    const m = await prismaOf(app).match.create({ data: { game: 'TICTACTOE', status: 'FINISHED', finishedAt: new Date(), state: {}, winnerId: a.user.id, players: { create: [{ userId: a.user.id, seat: 0, result: 'WON' }, { userId: bot.id, seat: 1, result: 'LOST' }] } } });
    expect(m.id).toBeTruthy();
    expect((await http().get('/leaderboard?period=all').set(bearer(a)).expect(200)).body.me.wins).toBe(0);
  });

  it('friends list says what each friend is doing and whether their room can be joined', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    await befriend(app, a, b);
    expect((await http().get('/friends').set(bearer(a))).body[0].activity).toEqual({ state: 'offline' });
    const sb = await connect(b);
    expect((await http().get('/friends').set(bearer(a))).body[0].activity).toEqual({ state: 'online' });
    const room = (await http().post('/rooms').set(bearer(b)).send({ game: 'LUDO', stake: 0 }).expect(201)).body;
    expect((await http().get('/friends').set(bearer(a))).body[0].activity).toMatchObject({ state: 'lobby', game: 'LUDO', code: room.code, joinable: true });
    await http().post('/rooms/join').set(bearer(a)).send({ code: room.code }).expect(200); // "join their game"
    sb.close();
  });

  it('sends quick reactions to the other player only, from a fixed list, with a rate limit', async () => {
    const { a, b, match } = await finishedGame('a');
    const sa = await connect(a), sb = await connect(b);
    const got = next(sb, 'match:emote');
    expect(await ack(sa, 'match:emote', { matchId: match.id, emote: 'gg' })).toEqual({ ok: true });
    expect(await got).toMatchObject({ matchId: match.id, emote: 'gg', from: { id: a.user.id } });
    expect((await ack(sa, 'match:emote', { matchId: match.id, emote: 'wow' })).error).toBe('RATE_LIMITED');
    expect((await ack(sb, 'match:emote', { matchId: match.id, emote: '<script>' })).error).toBe('BAD_EMOTE');
    const stranger = await newPlayer(app);
    const ss = await connect(stranger);
    expect((await ack(ss, 'match:emote', { matchId: match.id, emote: 'gg' })).error).toBe('NOT_IN_MATCH');
    expect((await http().get('/emotes').set(bearer(a)).expect(200)).body.emotes).toContain('rematch');
  });

  it('a blocked player does not receive reactions', async () => {
    const { a, b, match } = await finishedGame('a');
    await http().post(`/blocks/${b.user.id}`).set(bearer(a)).expect(200);
    const sa = await connect(a), sb = await connect(b);
    let heard = false;
    sb.on('match:emote', () => { heard = true; });
    expect(await ack(sa, 'match:emote', { matchId: match.id, emote: 'gg' })).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 300));
    expect(heard).toBe(false);
  });

  it('rematch: the other player is told, the asker is ready, and a closed room is refused', async () => {
    const { a, b, match, room } = await finishedGame('a');
    const sa = await connect(a);
    const told = next(sa, 'match:rematch');
    const r = (await http().post(`/social/rematch/${match.id}`).set(bearer(b)).expect(200)).body;
    expect(r.members.find((m: any) => m.userId === b.user.id).ready).toBe(true);
    expect(await told).toMatchObject({ matchId: match.id, from: { id: b.user.id } });
    expect(room.code).toBeTruthy();
    await http().post('/rooms/current/leave').set(bearer(a)).expect(200);
    await http().post('/rooms/current/leave').set(bearer(b)).expect(200);
    expect((await http().post(`/social/rematch/${match.id}`).set(bearer(a)).expect(409)).body.error).toBe('ROOM_GONE');
  });

  it('hands out Agora tokens only to people sharing a room, and rings friends who are online', async () => {
    const { a, b } = await finishedGame('a');
    const v = (await http().post('/voice/room').set(bearer(a)).expect(200)).body;
    expect(v).toMatchObject({ appId: process.env.AGORA_APP_ID, uid: expect.any(Number) });
    expect(v.channel).toMatch(/^room-/);
    expect(v.token.length).toBeGreaterThan(40);
    const lone = await newPlayer(app);
    await http().post('/voice/room').set(bearer(lone)).expect(404);

    await befriend(app, a, b);
    await http().post('/voice/calls').set(bearer(a)).send({ userId: lone.user.id }).expect(403);
    const sa = await connect(a), sb = await connect(b);
    const ring = next(sb, 'call:incoming');
    const call = (await http().post('/voice/calls').set(bearer(a)).send({ userId: b.user.id }).expect(200)).body;
    expect(call.channel).toMatch(/^dm-/);
    expect(await ring).toMatchObject({ callId: call.callId, from: { id: a.user.id } });
    await http().post('/voice/calls').set(bearer(a)).send({ userId: b.user.id }).expect(409); // already ringing
    const answered = next(sa, 'call:answered');
    const joined = (await http().post(`/voice/calls/${call.callId}/answer`).set(bearer(b)).send({ accept: true }).expect(200)).body;
    await answered;
    expect(joined.channel).toBe(call.channel);
    expect(joined.uid).not.toBe(call.uid);
    const ended = next(sa, 'call:ended');
    await http().post(`/voice/calls/${call.callId}/end`).set(bearer(b)).expect(200);
    await ended;
    await http().post(`/voice/calls/${call.callId}/answer`).set(bearer(b)).send({ accept: true }).expect(404);
  });

  it('says plainly when voice is not switched on', async () => {
    const saved = [process.env.AGORA_APP_ID, process.env.AGORA_APP_CERTIFICATE];
    delete process.env.AGORA_APP_ID; delete process.env.AGORA_APP_CERTIFICATE;
    try {
      const { a } = await finishedGame('a');
      expect((await http().post('/voice/room').set(bearer(a)).expect(503)).body.error).toBe('VOICE_NOT_CONFIGURED');
    } finally { [process.env.AGORA_APP_ID, process.env.AGORA_APP_CERTIFICATE] = saved as string[]; }
  });
});
