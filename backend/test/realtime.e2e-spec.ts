import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { bearer, befriend, createApp, newPlayer } from './helpers';

describe('Realtime', () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as any).port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await app.close();
  });

  function connect(token: string): Promise<Socket> {
    const s = io(url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    return new Promise((resolve, reject) => {
      s.once('ready', () => resolve(s));
      s.once('unauthorized', () => reject(new Error('unauthorized')));
      s.once('connect_error', reject);
      setTimeout(() => reject(new Error('connect timeout')), 4000);
    });
  }
  /** Resolves with the next matching event; attach BEFORE doing the action that causes it. */
  function next<T = any>(s: Socket, event: string, pred: (p: T) => boolean = () => true, ms = 4000): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { s.off(event, h); reject(new Error(`timed out waiting for ${event}`)); }, ms);
      const h = (p: T) => { if (pred(p)) { clearTimeout(t); s.off(event, h); resolve(p); } };
      s.on(event, h);
    });
  }
  const quiet = (s: Socket, event: string, ms = 300) =>
    new Promise<boolean>((resolve) => { const h = () => resolve(false); s.once(event, h); setTimeout(() => { s.off(event, h); resolve(true); }, ms); });

  it('accepts a valid token and rejects a bad or missing one', async () => {
    const p = await newPlayer(app);
    const s = await connect(p.tokens.accessToken);
    expect(s.connected).toBe(true);
    await expect(connect('garbage')).rejects.toThrow('unauthorized');
    await expect(connect(undefined as any)).rejects.toThrow('unauthorized');
  });

  it('pushes friend requests and acceptances', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    const sa = await connect(a.tokens.accessToken), sb = await connect(b.tokens.accessToken);
    const gotReq = next(sb, 'friend:request');
    const sent = await http().post('/friends/requests').set(bearer(a)).send({ username: b.user.username }).expect(201);
    expect((await gotReq).from.id).toBe(a.user.id);
    const gotAccept = next(sa, 'friend:accepted');
    await http().post(`/friends/requests/${sent.body.id}/accept`).set(bearer(b)).expect(200);
    expect((await gotAccept).friend.id).toBe(b.user.id);
  });

  it('tells friends when you come online and go offline, and shows it in the friends list', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    await befriend(app, a, b);
    const sa = await connect(a.tokens.accessToken);
    const online = next(sa, 'friend:online', (p: any) => p.userId === b.user.id);
    const sb = await connect(b.tokens.accessToken);
    await online;
    expect((await http().get('/friends').set(bearer(a))).body[0].online).toBe(true);
    const offline = next(sa, 'friend:offline', (p: any) => p.userId === b.user.id);
    sb.close();
    await offline;
    expect((await http().get('/friends').set(bearer(a))).body[0].online).toBe(false);
  });

  it('a second connection from the same player does not repeat the online notice', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    await befriend(app, a, b);
    const sa = await connect(a.tokens.accessToken);
    await connect(b.tokens.accessToken);
    await next(sa, 'friend:online');
    const again = quiet(sa, 'friend:online');
    await connect(b.tokens.accessToken);
    expect(await again).toBe(true);
  });

  it('streams lobby changes to everyone in the room, and to nobody else', async () => {
    const host = await newPlayer(app), g = await newPlayer(app), outsider = await newPlayer(app);
    const sh = await connect(host.tokens.accessToken), sg = await connect(g.tokens.accessToken), so = await connect(outsider.tokens.accessToken);
    const room = (await http().post('/rooms').set(bearer(host)).send({ game: 'TICTACTOE', stake: 0 }).expect(201)).body;

    const hostSeesJoin = next(sh, 'room:update', (r: any) => r.members.length === 2);
    const outsiderQuiet = quiet(so, 'room:update');
    await http().post('/rooms/join').set(bearer(g)).send({ code: room.code }).expect(200);
    await hostSeesJoin;
    expect(await outsiderQuiet).toBe(true);

    const guestSeesReady = next(sg, 'room:update', (r: any) => r.members.find((m: any) => m.userId === g.user.id)?.ready === true);
    await http().post('/rooms/current/ready').set(bearer(g)).send({ ready: true }).expect(200);
    await guestSeesReady;

    const started = next(sg, 'room:started');
    await http().post('/rooms/current/start').set(bearer(host)).expect(200);
    expect((await started).status).toBe('IN_PROGRESS');
  });

  it('delivers invites and kick notices to the right player', async () => {
    const host = await newPlayer(app), friend = await newPlayer(app);
    await befriend(app, host, friend);
    const sf = await connect(friend.tokens.accessToken);
    await http().post('/rooms').set(bearer(host)).send({ game: 'LUDO', stake: 0 }).expect(201);
    const gotInvite = next(sf, 'room:invite');
    await http().post('/rooms/current/invite').set(bearer(host)).send({ userId: friend.user.id }).expect(200);
    const inv = await gotInvite;
    expect(inv.from.id).toBe(host.user.id);
    await http().post(`/rooms/invites/${inv.id}/accept`).set(bearer(friend)).expect(200);
    const kicked = next(sf, 'room:kicked');
    await http().post(`/rooms/current/kick/${friend.user.id}`).set(bearer(host)).expect(200);
    await kicked;
  });

  it('relays room chat to members only, trims it, and rate limits bursts', async () => {
    const host = await newPlayer(app), g = await newPlayer(app), outsider = await newPlayer(app);
    const sh = await connect(host.tokens.accessToken), sg = await connect(g.tokens.accessToken), so = await connect(outsider.tokens.accessToken);
    const room = (await http().post('/rooms').set(bearer(host)).send({ game: 'TICTACTOE', stake: 0 }).expect(201)).body;
    await http().post('/rooms/join').set(bearer(g)).send({ code: room.code }).expect(200);

    const heard = next(sg, 'room:chat');
    const outsiderQuiet = quiet(so, 'room:chat');
    const ack = await sh.emitWithAck('room:chat', { text: '  gg, let’s go  ' });
    expect(ack).toEqual({ ok: true });
    const msg = await heard;
    expect(msg).toMatchObject({ text: 'gg, let’s go', from: { id: host.user.id } });
    expect(await outsiderQuiet).toBe(true);

    expect(await so.emitWithAck('room:chat', { text: 'hi' })).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
    expect(await sh.emitWithAck('room:chat', { text: '   ' })).toEqual({ ok: false, error: 'EMPTY' });
    expect(await sh.emitWithAck('room:chat', {})).toEqual({ ok: false, error: 'EMPTY' });
    const long = await sh.emitWithAck('room:chat', { text: 'x'.repeat(500) });
    expect(long.ok).toBe(true);
    const results: any[] = [];
    for (let i = 0; i < 6; i++) results.push(await sh.emitWithAck('room:chat', { text: `m${i}` }));
    expect(results.some((r) => r.error === 'RATE_LIMITED')).toBe(true);
  });

  it('a player who leaves stops getting room traffic', async () => {
    const host = await newPlayer(app), g = await newPlayer(app);
    const sh = await connect(host.tokens.accessToken), sg = await connect(g.tokens.accessToken);
    const room = (await http().post('/rooms').set(bearer(host)).send({ game: 'TICTACTOE', stake: 0 }).expect(201)).body;
    await http().post('/rooms/join').set(bearer(g)).send({ code: room.code }).expect(200);
    await http().post('/rooms/current/leave').set(bearer(g)).expect(200);
    const silent = quiet(sg, 'room:update');
    await sh.emitWithAck('room:chat', { text: 'still there?' });
    await http().post('/rooms/current/ready').set(bearer(host)).send({ ready: true }).expect(200);
    expect(await silent).toBe(true);
  });

  it('announces a quick match to both players over the socket', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    const sa = await connect(a.tokens.accessToken), sb = await connect(b.tokens.accessToken);
    const fa = next(sa, 'match:found'), fb = next(sb, 'match:found');
    await http().post('/matchmaking/queue').set(bearer(a)).send({ game: 'AYO', stake: 50 }).expect(200);
    await http().post('/matchmaking/queue').set(bearer(b)).send({ game: 'AYO', stake: 50 }).expect(200);
    const [ra, rb] = await Promise.all([fa, fb]);
    expect(ra.id).toBe(rb.id);
    expect(ra.status).toBe('IN_PROGRESS');
  });

  it('removes a disconnected player from the matchmaking queue', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    const sa = await connect(a.tokens.accessToken);
    await http().post('/matchmaking/queue').set(bearer(a)).send({ game: 'TICTACTOE', stake: 0 }).expect(200);
    sa.close();
    await new Promise((r) => setTimeout(r, 300));
    await http().post('/matchmaking/queue').set(bearer(b)).send({ game: 'TICTACTOE', stake: 0 }).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    await http().get('/rooms/current').set(bearer(b)).expect(404); // not matched with the ghost
    await http().delete('/matchmaking/queue').set(bearer(b)).expect(200);
  });
});
