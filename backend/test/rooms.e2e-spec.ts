import { RoomsService } from '../src/rooms/rooms.service';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PresenceService } from '../src/realtime/presence.service';
import { ROOM_IDLE_MS } from '../src/rooms/game-config';
import { befriend, bearer, createApp, newPlayer, prismaOf, setCoins } from './helpers';

describe('Rooms', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  const createRoom = (p: any, body: Record<string, unknown> = { game: 'TICTACTOE', stake: 100 }) => http().post('/rooms').set(bearer(p)).send(body);
  const join = (p: any, code: string) => http().post('/rooms/join').set(bearer(p)).send({ code });

  describe('create and join', () => {
    it('creates a lobby with a short code and the host in seat 0', async () => {
      const host = await newPlayer(app);
      const res = await createRoom(host).expect(201);
      expect(res.body).toMatchObject({ game: 'TICTACTOE', stake: 100, status: 'WAITING', kind: 'PRIVATE', minPlayers: 2, maxPlayers: 2, hostId: host.user.id });
      expect(res.body.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0]).toMatchObject({ userId: host.user.id, seat: 0, ready: true });
      const cur = await http().get('/rooms/current').set(bearer(host)).expect(200);
      expect(cur.body.id).toBe(res.body.id);
    });

    it('validates game, stake and player count', async () => {
      const p = await newPlayer(app);
      await createRoom(p, { game: 'CHESS', stake: 0 }).expect(400);
      expect((await createRoom(p, { game: 'TICTACTOE', stake: 77 }).expect(400)).body.error).toBe('BAD_STAKE');
      expect((await createRoom(p, { game: 'TICTACTOE', stake: 0, maxPlayers: 3 }).expect(400)).body.error).toBe('BAD_PLAYER_COUNT');
      await createRoom(p, { game: 'LUDO', stake: 0, maxPlayers: 3 }).expect(201);
    });

    it('will not let you stake more than you own', async () => {
      const p = await newPlayer(app);
      const res = await createRoom(p, { game: 'AYO', stake: 5000 }).expect(402);
      expect(res.body.error).toBe('INSUFFICIENT_COINS');
    });

    it('joins by code in any case, and joining twice is harmless', async () => {
      const host = await newPlayer(app), guest = await newPlayer(app);
      const room = (await createRoom(host).expect(201)).body;
      const j = await join(guest, room.code.toLowerCase()).expect(200);
      expect(j.body.members.map((m: any) => m.seat)).toEqual([0, 1]);
      await join(guest, room.code).expect(200);
      expect((await http().get('/rooms/current').set(bearer(host))).body.members).toHaveLength(2);
    });

    it('one room at a time', async () => {
      const a = await newPlayer(app), b = await newPlayer(app), c = await newPlayer(app);
      const r1 = (await createRoom(a).expect(201)).body;
      const r2 = (await createRoom(b).expect(201)).body;
      expect((await createRoom(a).expect(409)).body.error).toBe('ALREADY_IN_ROOM');
      expect((await join(a, r2.code).expect(409)).body.error).toBe('ALREADY_IN_ROOM');
      await join(c, r1.code).expect(200);
    });

    it('rejects unknown codes, full rooms and games already started', async () => {
      const host = await newPlayer(app), g1 = await newPlayer(app), g2 = await newPlayer(app);
      await join(g1, 'ABCDEF').expect(404);
      await join(g1, 'abc').expect(400);
      const room = (await createRoom(host, { game: 'TICTACTOE', stake: 0 }).expect(201)).body;
      await join(g1, room.code).expect(200);
      expect((await join(g2, room.code).expect(409)).body.error).toBe('ROOM_FULL');

      const host2 = await newPlayer(app), g3 = await newPlayer(app), g4 = await newPlayer(app);
      const room2 = (await createRoom(host2, { game: 'LUDO', stake: 0 }).expect(201)).body;
      await join(g3, room2.code).expect(200);
      await http().post('/rooms/current/ready').set(bearer(g3)).send({ ready: true }).expect(200);
      await http().post('/rooms/current/start').set(bearer(host2)).expect(200);
      expect((await join(g4, room2.code).expect(409)).body.error).toBe('ROOM_STARTED'); // seats were free, game had begun
    });

    it('never seats more players than the room holds when many join at once', async () => {
      const host = await newPlayer(app);
      const room = (await createRoom(host, { game: 'TICTACTOE', stake: 0 }).expect(201)).body;
      const guests = await Promise.all(Array.from({ length: 6 }, () => newPlayer(app)));
      const results = await Promise.all(guests.map((g) => join(g, room.code)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409 && r.body.error === 'ROOM_FULL')).toHaveLength(5);
      expect(await prismaOf(app).roomMember.count({ where: { roomId: room.id } })).toBe(2);
    });

    it('turns away players who cannot afford the stake', async () => {
      const host = await newPlayer(app), poor = await newPlayer(app);
      await setCoins(app, poor.user.id, 40);
      const room = (await createRoom(host, { game: 'TICTACTOE', stake: 50 }).expect(201)).body;
      expect((await join(poor, room.code).expect(402)).body.error).toBe('INSUFFICIENT_COINS');
    });

    it('keeps blocked players out of each other’s rooms', async () => {
      const host = await newPlayer(app), guest = await newPlayer(app);
      await http().post(`/blocks/${host.user.id}`).set(bearer(guest)).expect(200);
      const room = (await createRoom(host, { game: 'TICTACTOE', stake: 0 }).expect(201)).body;
      expect((await join(guest, room.code).expect(403)).body.error).toBe('CANNOT_JOIN');
    });
  });

  describe('ready, start, kick', () => {
    async function lobby(stake = 100, game = 'TICTACTOE', extra = 1) {
      const host = await newPlayer(app);
      const room = (await createRoom(host, { game, stake }).expect(201)).body;
      const guests = [];
      for (let i = 0; i < extra; i++) { const g = await newPlayer(app); await join(g, room.code).expect(200); guests.push(g); }
      return { host, guests, room };
    }

    it('host starts once everyone else is ready', async () => {
      const { host, guests } = await lobby();
      expect((await http().post('/rooms/current/start').set(bearer(host)).expect(409)).body.error).toBe('NOT_ALL_READY');
      await http().post('/rooms/current/ready').set(bearer(guests[0])).send({ ready: true }).expect(200);
      const res = await http().post('/rooms/current/start').set(bearer(host)).expect(200);
      expect(res.body.status).toBe('IN_PROGRESS');
      // no joining, readying or kicking mid-game
      const late = await newPlayer(app);
      expect((await join(late, res.body.code).expect(409)).body.error).toBe('ROOM_STARTED');
      await http().post('/rooms/current/ready').set(bearer(guests[0])).send({ ready: false }).expect(409);
      await http().post('/rooms/current/start').set(bearer(host)).expect(409);
    });

    it('needs enough players and only the host can start', async () => {
      const solo = await newPlayer(app);
      await createRoom(solo, { game: 'TICTACTOE', stake: 0 }).expect(201);
      expect((await http().post('/rooms/current/start').set(bearer(solo)).expect(409)).body.error).toBe('NOT_ENOUGH_PLAYERS');
      const { guests } = await lobby();
      await http().post('/rooms/current/ready').set(bearer(guests[0])).send({ ready: true }).expect(200);
      expect((await http().post('/rooms/current/start').set(bearer(guests[0])).expect(403)).body.error).toBe('NOT_HOST');
      const nobody = await newPlayer(app);
      await http().post('/rooms/current/start').set(bearer(nobody)).expect(404);
    });

    it('re-checks everyone’s coins at start and names who is short', async () => {
      const { host, guests } = await lobby(500);
      await http().post('/rooms/current/ready').set(bearer(guests[0])).send({ ready: true }).expect(200);
      await setCoins(app, guests[0].user.id, 100); // spent coins after getting ready
      const res = await http().post('/rooms/current/start').set(bearer(host)).expect(409);
      expect(res.body.error).toBe('CANNOT_AFFORD');
      expect(res.body.players.map((p: any) => p.userId)).toEqual([guests[0].user.id]);
      await setCoins(app, guests[0].user.id, 100);
      await http().post('/rooms/current/ready').set(bearer(guests[0])).send({ ready: true }).expect(402);
    });

    it('the host can remove a player, nobody else can', async () => {
      const { host, guests } = await lobby(0, 'LUDO', 2);
      await http().post(`/rooms/current/kick/${guests[1].user.id}`).set(bearer(guests[0])).expect(403);
      await http().post(`/rooms/current/kick/${host.user.id}`).set(bearer(host)).expect(400);
      await http().post(`/rooms/current/kick/${guests[0].user.id}`).set(bearer(host)).expect(200);
      await http().get('/rooms/current').set(bearer(guests[0])).expect(404);
      expect((await http().get('/rooms/current').set(bearer(host))).body.members).toHaveLength(2);
      await http().post(`/rooms/current/kick/${guests[0].user.id}`).set(bearer(host)).expect(404);
    });
  });

  describe('leaving', () => {
    it('hands the host role to the next player, and closes the room when empty', async () => {
      const host = await newPlayer(app), g = await newPlayer(app);
      const room = (await createRoom(host, { game: 'TICTACTOE', stake: 0 }).expect(201)).body;
      await join(g, room.code).expect(200);
      await http().post('/rooms/current/leave').set(bearer(host)).expect(200);
      const cur = (await http().get('/rooms/current').set(bearer(g)).expect(200)).body;
      expect(cur.hostId).toBe(g.user.id);
      expect(cur.members).toHaveLength(1);
      await http().post('/rooms/current/leave').set(bearer(g)).expect(200);
      expect(await prismaOf(app).room.count({ where: { id: room.id } })).toBe(0);
      await http().post('/rooms/current/leave').set(bearer(g)).expect(404);
      // the code is free again and the leaver can start over
      await createRoom(g).expect(201);
    });

    it('stops a started game when too few players remain', async () => {
      const host = await newPlayer(app), g = await newPlayer(app);
      const room = (await createRoom(host, { game: 'TICTACTOE', stake: 0 }).expect(201)).body;
      await join(g, room.code).expect(200);
      await http().post('/rooms/current/ready').set(bearer(g)).send({ ready: true }).expect(200);
      await http().post('/rooms/current/start').set(bearer(host)).expect(200);
      await http().post('/rooms/current/leave').set(bearer(g)).expect(200);
      const cur = (await http().get('/rooms/current').set(bearer(host)).expect(200)).body;
      expect(cur.status).toBe('WAITING');
    });

    it('a finished game returns the room to the lobby with everyone un-readied', async () => {
      const host = await newPlayer(app), g = await newPlayer(app);
      const room = (await createRoom(host, { game: 'TICTACTOE', stake: 0 }).expect(201)).body;
      await join(g, room.code).expect(200);
      await http().post('/rooms/current/ready').set(bearer(g)).send({ ready: true }).expect(200);
      await http().post('/rooms/current/start').set(bearer(host)).expect(200);
      const match = (await http().get('/matches/current').set(bearer(g)).expect(200)).body;
      await http().post(`/matches/${match.id}/forfeit`).set(bearer(g)).expect(200);
      const cur = (await http().get('/rooms/current').set(bearer(g)).expect(200)).body;
      expect(cur.status).toBe('WAITING');
      expect(cur.members.find((m: any) => m.userId === g.user.id).ready).toBe(false);
    });

    it('removes players who have been offline too long from idle lobbies', async () => {
      const host = await newPlayer(app), g = await newPlayer(app);
      const room = (await createRoom(host, { game: 'TICTACTOE', stake: 0 }).expect(201)).body;
      await join(g, room.code).expect(200);
      const rooms = app.get(RoomsService);
      expect(await rooms.sweepIdle(Date.now() + 1000)).toBeGreaterThanOrEqual(0);
      expect(await prismaOf(app).roomMember.count({ where: { roomId: room.id } })).toBe(2); // not idle long enough
      // keep the other lobbies in this test file out of it by checking only this room
      await rooms.sweepIdle(Date.now() + ROOM_IDLE_MS + 60_000);
      expect(await prismaOf(app).room.count({ where: { id: room.id } })).toBe(0);
    });

    it('does not sweep players who are online', async () => {
      const host = await newPlayer(app);
      const room = (await createRoom(host, { game: 'TICTACTOE', stake: 0 }).expect(201)).body;
      const presence = app.get(PresenceService);
      presence.add(host.user.id, 'sock-1');
      await app.get(RoomsService).sweepIdle(Date.now() + ROOM_IDLE_MS * 5);
      expect(await prismaOf(app).room.count({ where: { id: room.id } })).toBe(1);
      presence.remove(host.user.id, 'sock-1');
    });
  });

  describe('invites', () => {
    it('invites a friend, who accepts straight into the room', async () => {
      const host = await newPlayer(app), friend = await newPlayer(app);
      await befriend(app, host, friend);
      await createRoom(host, { game: 'TICTACTOE', stake: 0 }).expect(201);
      const inv = await http().post('/rooms/current/invite').set(bearer(host)).send({ userId: friend.user.id }).expect(200);
      const list = await http().get('/rooms/invites').set(bearer(friend)).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ id: inv.body.id, from: { id: host.user.id }, room: { game: 'TICTACTOE', stake: 0 } });
      const res = await http().post(`/rooms/invites/${inv.body.id}/accept`).set(bearer(friend)).expect(200);
      expect(res.body.members.map((m: any) => m.userId)).toEqual([host.user.id, friend.user.id]);
      expect((await http().get('/rooms/invites').set(bearer(friend))).body).toHaveLength(0);
    });

    it('only friends can be invited, and only into your own open room', async () => {
      const host = await newPlayer(app), stranger = await newPlayer(app), friend = await newPlayer(app);
      await http().post('/rooms/current/invite').set(bearer(host)).send({ userId: stranger.user.id }).expect(404); // no room yet
      await createRoom(host, { game: 'LUDO', stake: 0 }).expect(201);
      expect((await http().post('/rooms/current/invite').set(bearer(host)).send({ userId: stranger.user.id }).expect(403)).body.error).toBe('NOT_FRIENDS');
      await befriend(app, host, friend);
      await http().post('/rooms/current/invite').set(bearer(host)).send({ userId: friend.user.id }).expect(200);
      await http().post('/rooms/current/invite').set(bearer(host)).send({ userId: friend.user.id }).expect(200); // re-invite refreshes
      expect(await prismaOf(app).roomInvite.count({ where: { toUserId: friend.user.id } })).toBe(1);
    });

    it('lets the invited player decline, and ignores invites meant for someone else or expired', async () => {
      const host = await newPlayer(app), friend = await newPlayer(app), other = await newPlayer(app);
      await befriend(app, host, friend);
      await createRoom(host, { game: 'TICTACTOE', stake: 0 }).expect(201);
      const inv = (await http().post('/rooms/current/invite').set(bearer(host)).send({ userId: friend.user.id }).expect(200)).body;
      await http().post(`/rooms/invites/${inv.id}/accept`).set(bearer(other)).expect(404);
      await prismaOf(app).roomInvite.update({ where: { id: inv.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await http().post(`/rooms/invites/${inv.id}/accept`).set(bearer(friend)).expect(404);
      expect((await http().get('/rooms/invites').set(bearer(friend))).body).toHaveLength(0);
      const inv2 = (await http().post('/rooms/current/invite').set(bearer(host)).send({ userId: friend.user.id }).expect(200)).body;
      await http().delete(`/rooms/invites/${inv2.id}`).set(bearer(friend)).expect(200);
      await http().delete(`/rooms/invites/${inv2.id}`).set(bearer(friend)).expect(404);
    });

    it('blocking someone cancels their pending invites', async () => {
      const host = await newPlayer(app), friend = await newPlayer(app);
      await befriend(app, host, friend);
      await createRoom(host, { game: 'TICTACTOE', stake: 0 }).expect(201);
      await http().post('/rooms/current/invite').set(bearer(host)).send({ userId: friend.user.id }).expect(200);
      await http().post(`/blocks/${host.user.id}`).set(bearer(friend)).expect(200);
      expect((await http().get('/rooms/invites').set(bearer(friend))).body).toHaveLength(0);
    });
  });
});
