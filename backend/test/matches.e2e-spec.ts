import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { MatchesService } from '../src/matches/matches.service';
import { RoomsService } from '../src/rooms/rooms.service';
import { Player, bearer, createApp, newPlayer, prismaOf, setCoins } from './helpers';

describe('Matches: Tic Tac Toe with stakes', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  const coins = async (p: Player) => (await http().get('/wallet').set(bearer(p)).expect(200)).body.coins as number;
  const getMatch = async (p: Player, id: string) => (await http().get(`/matches/${id}`).set(bearer(p)).expect(200)).body;

  /** Two players, a lobby with the stake, and the game started. */
  async function startGame(stake = 100, game = 'TICTACTOE') {
    const host = await newPlayer(app), guest = await newPlayer(app);
    const room = (await http().post('/rooms').set(bearer(host)).send({ game, stake }).expect(201)).body;
    await http().post('/rooms/join').set(bearer(guest)).send({ code: room.code }).expect(200);
    await http().post('/rooms/current/ready').set(bearer(guest)).send({ ready: true }).expect(200);
    await http().post('/rooms/current/start').set(bearer(host)).expect(200);
    const match = (await http().get('/matches/current').set(bearer(host)).expect(200)).body;
    const bySeat = (seat: number) => (match.players.find((p: any) => p.seat === seat).userId === host.user.id ? host : guest);
    return { host, guest, room, match, bySeat };
  }

  /** Plays cells in turn order, whoever is on the clock. Returns the final match. */
  async function playCells(g: Awaited<ReturnType<typeof startGame>>, cells: number[]) {
    let m = g.match;
    for (const cell of cells) {
      const p = g.bySeat(m.turnSeat);
      m = (await http().post(`/matches/${m.id}/move`).set(bearer(p)).send({ version: m.version, move: { cell } }).expect(200)).body;
    }
    return m;
  }

  /** For any match the ledger entries (stakes, payouts, refunds, house cut) add up to zero. */
  async function ledgerSum(matchId: string): Promise<bigint> {
    const r = await prismaOf(app).$queryRaw<Array<{ s: bigint }>>`SELECT COALESCE(SUM("amount"),0)::bigint AS s FROM "LedgerEntry" WHERE "reference" = ${`match:${matchId}`}`;
    return r[0].s;
  }

  describe('winning', () => {
    it('takes both stakes at the start, pays the winner the pot minus 10%, and books the house cut', async () => {
      const g = await startGame(100);
      expect(g.match).toMatchObject({ game: 'TICTACTOE', stake: 100, pot: 200, status: 'ACTIVE', version: 1 });
      expect(await coins(g.host)).toBe(900);
      expect(await coins(g.guest)).toBe(900);
      expect(g.match.turnDeadline).toBeTruthy();

      const first = g.bySeat(g.match.turnSeat), second = first === g.host ? g.guest : g.host;
      const done = await playCells(g, [0, 3, 1, 4, 2]); // first player takes the top row
      expect(done).toMatchObject({ status: 'FINISHED', endReason: 'NORMAL', winnerId: first.user.id, houseFee: 20, turnSeat: null });
      expect(done.state.winLine).toEqual([0, 1, 2]);
      expect(done.players.find((p: any) => p.userId === first.user.id)).toMatchObject({ result: 'WON', payout: 180 });
      expect(done.players.find((p: any) => p.userId === second.user.id)).toMatchObject({ result: 'LOST', payout: 0 });

      expect(await coins(first)).toBe(900 + 180);
      expect(await coins(second)).toBe(900);
      expect(await ledgerSum(done.id)).toBe(0n);
      const entries = await prismaOf(app).ledgerEntry.findMany({ where: { reference: `match:${done.id}` }, orderBy: { amount: 'asc' } });
      expect(entries.map((e) => [e.type, Number(e.amount)]).sort()).toEqual(
        [['GAME_PAYOUT', 180], ['GAME_STAKE', -100], ['GAME_STAKE', -100], ['HOUSE_FEE', 20]].sort(),
      );
      expect(entries.find((e) => e.type === 'HOUSE_FEE')!.walletId).toBeNull();
    });

    it('returns everyone to the lobby for a rematch, and the rematch charges again', async () => {
      const g = await startGame(100);
      await playCells(g, [0, 3, 1, 4, 2]);
      const lobby = (await http().get('/rooms/current').set(bearer(g.host)).expect(200)).body;
      expect(lobby.status).toBe('WAITING');
      await http().post('/matches/current').set(bearer(g.host)).expect(404);
      await http().get('/matches/current').set(bearer(g.host)).expect(404);
      await http().post('/rooms/current/ready').set(bearer(g.guest)).send({ ready: true }).expect(200);
      await http().post('/rooms/current/start').set(bearer(g.host)).expect(200);
      const again = (await http().get('/matches/current').set(bearer(g.host)).expect(200)).body;
      expect(again.id).not.toBe(g.match.id);
      expect(await coins(g.host) + await coins(g.guest)).toBe(2000 - 20 - 200); // one fee taken, new stakes in play
    });

    it('lists finished games with the net coins won or lost', async () => {
      const g = await startGame(100);
      const first = g.bySeat(g.match.turnSeat), second = first === g.host ? g.guest : g.host;
      const done = await playCells(g, [0, 3, 1, 4, 2]);
      const w = (await http().get('/matches/history').set(bearer(first)).expect(200)).body;
      expect(w.matches[0]).toMatchObject({ matchId: done.id, game: 'TICTACTOE', result: 'WON', stake: 100, payout: 180, net: 80 });
      expect(w.matches[0].opponents[0].id).toBe(second.user.id);
      const l = (await http().get('/matches/history').set(bearer(second)).expect(200)).body;
      expect(l.matches[0]).toMatchObject({ result: 'LOST', payout: 0, net: -100 });
    });

    it('pages through history, newest first', async () => {
      const g = await startGame(0);
      for (let i = 0; i < 3; i++) {
        await playCells(g, [0, 3, 1, 4, 2]);
        await http().post('/rooms/current/ready').set(bearer(g.guest)).send({ ready: true }).expect(200);
        await http().post('/rooms/current/start').set(bearer(g.host)).expect(200);
        g.match = (await http().get('/matches/current').set(bearer(g.host)).expect(200)).body;
      }
      await http().post(`/matches/${g.match.id}/forfeit`).set(bearer(g.host)).expect(200);
      const p1 = (await http().get('/matches/history?limit=3').set(bearer(g.host)).expect(200)).body;
      expect(p1.matches).toHaveLength(3);
      const p2 = (await http().get(`/matches/history?limit=3&cursor=${p1.nextCursor}`).set(bearer(g.host)).expect(200)).body;
      expect(p2.matches).toHaveLength(1);
      expect(p2.nextCursor).toBeNull();
    });
  });

  describe('draws', () => {
    it('refunds both stakes in full with no house cut', async () => {
      const g = await startGame(250);
      const done = await playCells(g, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
      expect(done).toMatchObject({ status: 'FINISHED', endReason: 'DRAW', winnerId: null, houseFee: 0 });
      expect(done.players.map((p: any) => [p.result, p.payout])).toEqual([['DRAW', 250], ['DRAW', 250]]);
      expect(await coins(g.host)).toBe(1000);
      expect(await coins(g.guest)).toBe(1000);
      expect(await ledgerSum(done.id)).toBe(0n);
      const h = (await http().get('/matches/history').set(bearer(g.host)).expect(200)).body;
      expect(h.matches[0]).toMatchObject({ result: 'DRAW', net: 0 });
    });
  });

  describe('friendly games (stake 0)', () => {
    it('move no coins at all', async () => {
      const g = await startGame(0);
      const done = await playCells(g, [0, 3, 1, 4, 2]);
      expect(done).toMatchObject({ status: 'FINISHED', houseFee: 0, pot: 0 });
      expect(await coins(g.host)).toBe(1000);
      expect(await coins(g.guest)).toBe(1000);
      expect(await prismaOf(app).ledgerEntry.count({ where: { reference: `match:${done.id}` } })).toBe(0);
    });
  });

  describe('rules enforced by the server', () => {
    it('rejects moves out of turn, onto taken squares, off the board, and from outsiders', async () => {
      const g = await startGame(0);
      const mover = g.bySeat(g.match.turnSeat), waiting = mover === g.host ? g.guest : g.host;
      const post = (p: Player, body: any, id = g.match.id) => http().post(`/matches/${id}/move`).set(bearer(p)).send(body);

      expect((await post(waiting, { version: 1, move: { cell: 0 } }).expect(409)).body.error).toBe('NOT_YOUR_TURN');
      expect((await post(mover, { version: 1, move: { cell: 9 } }).expect(400)).body.error).toBe('BAD_MOVE');
      expect((await post(mover, { version: 1, move: { cell: 'x' } }).expect(400)).body.error).toBe('BAD_MOVE');
      await post(mover, { version: 1, move: { cell: 4 } }).expect(200);
      expect((await post(waiting, { version: 2, move: { cell: 4 } }).expect(400)).body.error).toBe('CELL_TAKEN');
      expect((await post(waiting, { version: 1, move: { cell: 0 } }).expect(409)).body.error).toBe('STALE_STATE');
      const outsider = await newPlayer(app);
      await post(outsider, { version: 2, move: { cell: 0 } }).expect(404);
      await post(waiting, { move: { cell: 0 } }).expect(400);
      await post(waiting, { version: 2, move: 'cell 0' }).expect(400);
      await post(waiting, { version: 2, move: { cell: 0 }, extra: 1 }).expect(400);
      await http().post(`/matches/${g.match.id}/move`).send({ version: 2, move: { cell: 0 } }).expect(401);
    });

    it('lets only the two players see a match', async () => {
      const g = await startGame(0);
      const outsider = await newPlayer(app);
      await http().get(`/matches/${g.match.id}`).set(bearer(outsider)).expect(404);
      await http().get(`/matches/${g.match.id}`).expect(401);
      await http().get('/matches/not-a-uuid').set(bearer(g.host)).expect(400);
      await http().post(`/matches/${g.match.id}/forfeit`).set(bearer(outsider)).expect(404);
    });

    it('refuses moves after the match has ended', async () => {
      const g = await startGame(0);
      const done = await playCells(g, [0, 3, 1, 4, 2]);
      const p = g.bySeat(0);
      expect((await http().post(`/matches/${done.id}/move`).set(bearer(p)).send({ version: done.version, move: { cell: 5 } }).expect(409)).body.error).toBe('MATCH_OVER');
      expect((await http().post(`/matches/${done.id}/forfeit`).set(bearer(p)).expect(409)).body.error).toBe('MATCH_OVER');
    });

    it('applies a move sent twice at once only once', async () => {
      const g = await startGame(0);
      const mover = g.bySeat(g.match.turnSeat);
      const send = () => http().post(`/matches/${g.match.id}/move`).set(bearer(mover)).send({ version: 1, move: { cell: 4 } });
      const results = await Promise.all([send(), send(), send()]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect((await getMatch(mover, g.match.id)).state.moves).toBe(1);
    });
  });

  describe('forfeits', () => {
    it('resigning pays the opponent as a win', async () => {
      const g = await startGame(100);
      await http().post(`/matches/${g.match.id}/forfeit`).set(bearer(g.host)).expect(200);
      const m = await getMatch(g.guest, g.match.id);
      expect(m).toMatchObject({ status: 'FINISHED', endReason: 'FORFEIT', winnerId: g.guest.user.id, houseFee: 20 });
      expect(await coins(g.guest)).toBe(1080);
      expect(await coins(g.host)).toBe(900);
      expect(await ledgerSum(m.id)).toBe(0n);
    });

    it('leaving the room mid-game forfeits the stake to the opponent', async () => {
      const g = await startGame(100);
      await http().post('/rooms/current/leave').set(bearer(g.guest)).expect(200);
      const m = await getMatch(g.host, g.match.id);
      expect(m).toMatchObject({ status: 'FINISHED', endReason: 'FORFEIT', winnerId: g.host.user.id });
      expect(await coins(g.host)).toBe(1080);
      expect(await coins(g.guest)).toBe(900);
      expect(await ledgerSum(m.id)).toBe(0n);
      expect((await http().get('/rooms/current').set(bearer(g.host)).expect(200)).body.status).toBe('WAITING');
    });

    it('if both leave, the last one out still gets the win and the room closes cleanly', async () => {
      const g = await startGame(100);
      await http().post('/rooms/current/leave').set(bearer(g.host)).expect(200);
      await http().post('/rooms/current/leave').set(bearer(g.guest)).expect(200);
      const m = await getMatch(g.guest, g.match.id);
      expect(m.status).toBe('FINISHED');
      expect(await ledgerSum(m.id)).toBe(0n);
      expect(await coins(g.host) + await coins(g.guest)).toBe(2000 - 20);
    });
  });

  describe('the clock', () => {
    it('makes the player who runs out of time lose, and only then', async () => {
      const g = await startGame(100);
      const matches = app.get(MatchesService);
      await matches.sweepTimeouts(Date.now() + 5_000); // 5s in: still inside the 30s limit
      expect((await getMatch(g.host, g.match.id)).status).toBe('ACTIVE');

      const late = g.bySeat(g.match.turnSeat), other = late === g.host ? g.guest : g.host;
      await matches.sweepTimeouts(Date.now() + 120_000);
      const m = await getMatch(g.host, g.match.id);
      expect(m).toMatchObject({ status: 'FINISHED', endReason: 'TIMEOUT', winnerId: other.user.id });
      expect(await coins(other)).toBe(1080);
      expect(await coins(late)).toBe(900);
      expect(await ledgerSum(m.id)).toBe(0n);
      await matches.sweepTimeouts(Date.now() + 240_000); // sweeping again changes nothing
      expect(await coins(other)).toBe(1080);
    });

    it('resets the clock after every move', async () => {
      const g = await startGame(0);
      const mover = g.bySeat(g.match.turnSeat);
      const before = new Date(g.match.turnDeadline).getTime();
      await new Promise((r) => setTimeout(r, 30));
      const m = (await http().post(`/matches/${g.match.id}/move`).set(bearer(mover)).send({ version: 1, move: { cell: 0 } }).expect(200)).body;
      expect(new Date(m.turnDeadline).getTime()).toBeGreaterThan(before);
      expect(m.turnSeat).not.toBe(g.match.turnSeat);
    });

    it('settles exactly once when the winning move and the timeout arrive together', async () => {
      const g = await startGame(100);
      let m = g.match;
      // play to the brink: first player needs cell 2 for the top row
      for (const cell of [0, 3, 1, 4]) {
        const p = g.bySeat(m.turnSeat);
        m = (await http().post(`/matches/${m.id}/move`).set(bearer(p)).send({ version: m.version, move: { cell } }).expect(200)).body;
      }
      const winner = g.bySeat(m.turnSeat);
      await prismaOf(app).match.update({ where: { id: m.id }, data: { turnDeadline: new Date(Date.now() - 1000) } });
      const [moveRes] = await Promise.all([
        http().post(`/matches/${m.id}/move`).set(bearer(winner)).send({ version: m.version, move: { cell: 2 } }),
        app.get(MatchesService).sweepTimeouts(),
      ]);
      expect([200, 409]).toContain(moveRes.status);
      const final = await getMatch(winner, m.id);
      expect(final.status).toBe('FINISHED');
      expect(['NORMAL', 'TIMEOUT']).toContain(final.endReason);
      const payouts = await prismaOf(app).ledgerEntry.count({ where: { reference: `match:${m.id}`, type: 'GAME_PAYOUT' } });
      expect(payouts).toBe(1);
      expect(await ledgerSum(m.id)).toBe(0n);
      expect(await coins(g.host) + await coins(g.guest)).toBe(2000 - 20);
    });

    it('puts a lobby back to waiting if it was left stuck in progress with no live match', async () => {
      const host = await newPlayer(app);
      const room = (await http().post('/rooms').set(bearer(host)).send({ game: 'TICTACTOE', stake: 0 }).expect(201)).body;
      await prismaOf(app).room.update({ where: { id: room.id }, data: { status: 'IN_PROGRESS', startedAt: new Date(Date.now() - 60_000) } });
      await app.get(MatchesService).recoverStuckRooms();
      expect((await http().get('/rooms/current').set(bearer(host)).expect(200)).body.status).toBe('WAITING');
    });
  });

  describe('quick match', () => {
    it('takes the stakes and starts the game for both players', async () => {
      const a = await newPlayer(app), b = await newPlayer(app);
      await http().post('/matchmaking/queue').set(bearer(a)).send({ game: 'TICTACTOE', stake: 50 }).expect(200);
      await http().post('/matchmaking/queue').set(bearer(b)).send({ game: 'TICTACTOE', stake: 50 }).expect(200);
      let m: any;
      for (let i = 0; i < 100 && !m; i++) {
        const r = await http().get('/matches/current').set(bearer(a));
        if (r.status === 200) m = r.body; else await new Promise((res) => setTimeout(res, 25));
      }
      expect(m).toMatchObject({ game: 'TICTACTOE', stake: 50, pot: 100, status: 'ACTIVE' });
      expect((await http().get('/matches/current').set(bearer(b)).expect(200)).body.id).toBe(m.id);
      expect(await coins(a)).toBe(950);
      expect(await coins(b)).toBe(950);
    });
  });

  describe('other games', () => {
    it('settle through the same rules for a four player table (stand-in engine)', async () => {
      const ps = await Promise.all([1, 2, 3, 4].map(() => newPlayer(app)));
      const room = (await http().post('/rooms').set(bearer(ps[0])).send({ game: 'LUDO', stake: 100, maxPlayers: 4 }).expect(201)).body;
      for (const p of ps.slice(1)) {
        await http().post('/rooms/join').set(bearer(p)).send({ code: room.code }).expect(200);
        await http().post('/rooms/current/ready').set(bearer(p)).send({ ready: true }).expect(200);
      }
      await http().post('/rooms/current/start').set(bearer(ps[0])).expect(200);
      const m = (await http().get('/matches/current').set(bearer(ps[0])).expect(200)).body;
      expect(m.pot).toBe(400);
      for (const p of ps) expect(await coins(p)).toBe(900);
      const winner = ps.find((p) => p.user.id === m.players.find((x: any) => x.seat === 0).userId)!;
      const done = (await http().post(`/matches/${m.id}/move`).set(bearer(winner)).send({ version: 1, move: { end: 'win' } }).expect(200)).body;
      expect(done).toMatchObject({ status: 'FINISHED', houseFee: 40, winnerId: winner.user.id });
      expect(await coins(winner)).toBe(900 + 360);
      expect(await ledgerSum(done.id)).toBe(0n);
    });

    it('keep playing when one of three leaves, and the remaining two decide it', async () => {
      const ps = await Promise.all([1, 2, 3].map(() => newPlayer(app)));
      const room = (await http().post('/rooms').set(bearer(ps[0])).send({ game: 'LUDO', stake: 100, maxPlayers: 3 }).expect(201)).body;
      for (const p of ps.slice(1)) {
        await http().post('/rooms/join').set(bearer(p)).send({ code: room.code }).expect(200);
        await http().post('/rooms/current/ready').set(bearer(p)).send({ ready: true }).expect(200);
      }
      await http().post('/rooms/current/start').set(bearer(ps[0])).expect(200);
      const m = (await http().get('/matches/current').set(bearer(ps[0])).expect(200)).body;
      await http().post(`/matches/${m.id}/forfeit`).set(bearer(ps[2])).expect(200);
      const mid = await getMatch(ps[0], m.id);
      expect(mid.status).toBe('ACTIVE');
      expect(mid.players.filter((p: any) => p.left)).toHaveLength(1);
      await http().post(`/matches/${m.id}/forfeit`).set(bearer(ps[1])).expect(200);
      const end = await getMatch(ps[0], m.id);
      expect(end).toMatchObject({ status: 'FINISHED', winnerId: ps[0].user.id, houseFee: 30 });
      expect(await coins(ps[0])).toBe(900 + 270);
      expect(await ledgerSum(m.id)).toBe(0n);
    });
  });

  describe('games that are not built yet', () => {
    let bare: INestApplication;
    beforeAll(async () => { bare = await createApp({ fakeEngines: false }); });
    afterAll(() => bare.close());

    it('cannot be played, and the app can tell which are available', async () => {
      const p = await newPlayer(bare);
      const list = (await request(bare.getHttpServer()).get('/games').expect(200)).body;
      expect(list.games.find((g: any) => g.game === 'TICTACTOE')).toMatchObject({ available: true, minPlayers: 2, maxPlayers: 2 });
      for (const g of ['AYO', 'LUDO', 'WATER_SORT']) expect(list.games.find((x: any) => x.game === g).available).toBe(false);
      expect(list).toMatchObject({ houseFeePercent: 10, turnTimeoutSeconds: 30 });
      expect(list.stakes).toContain(100);

      const api = (path: string, body: any) => request(bare.getHttpServer()).post(path).set(bearer(p)).send(body);
      expect((await api('/rooms', { game: 'AYO', stake: 0 }).expect(400)).body.error).toBe('GAME_NOT_AVAILABLE');
      expect((await api('/matchmaking/queue', { game: 'LUDO', stake: 0 }).expect(400)).body.error).toBe('GAME_NOT_AVAILABLE');
      await api('/rooms', { game: 'TICTACTOE', stake: 0 }).expect(201);
    });
  });

  describe('live updates', () => {
    it('pushes the start, every move and the result to both players', async () => {
      await app.listen(0);
      const url = `http://127.0.0.1:${(app.getHttpServer().address() as any).port}`;
      const open = (p: Player) => new Promise<Socket>((resolve, reject) => {
        const s = io(url, { auth: { token: p.tokens.accessToken }, transports: ['websocket'], forceNew: true, reconnection: false });
        s.once('ready', () => resolve(s)); s.once('unauthorized', () => reject(new Error('unauthorized')));
        setTimeout(() => reject(new Error('connect timeout')), 4000);
      });
      const next = (s: Socket, ev: string, pred: (p: any) => boolean = () => true) => new Promise<any>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timed out waiting for ${ev}`)), 4000);
        const h = (p: any) => { if (pred(p)) { clearTimeout(t); s.off(ev, h); resolve(p); } };
        s.on(ev, h);
      });

      const host = await newPlayer(app), guest = await newPlayer(app);
      const sh = await open(host), sg = await open(guest);
      try {
        const room = (await http().post('/rooms').set(bearer(host)).send({ game: 'TICTACTOE', stake: 100 }).expect(201)).body;
        await http().post('/rooms/join').set(bearer(guest)).send({ code: room.code }).expect(200);
        await http().post('/rooms/current/ready').set(bearer(guest)).send({ ready: true }).expect(200);

        const startedH = next(sh, 'match:started'), startedG = next(sg, 'match:started');
        await http().post('/rooms/current/start').set(bearer(host)).expect(200);
        const [m1] = await Promise.all([startedH, startedG]);
        expect(m1).toMatchObject({ game: 'TICTACTOE', pot: 200, status: 'ACTIVE' });

        const mover = m1.players.find((p: any) => p.seat === m1.turnSeat).userId === host.user.id ? host : guest;
        const sOther = mover === host ? sg : sh;
        const seen = next(sOther, 'match:state', (m) => m.version === 2);
        await http().post(`/matches/${m1.id}/move`).set(bearer(mover)).send({ version: 1, move: { cell: 4 } }).expect(200);
        expect((await seen).state.board[4]).toBe(m1.turnSeat);

        const endedH = next(sh, 'match:ended'), endedG = next(sg, 'match:ended');
        await http().post(`/matches/${m1.id}/forfeit`).set(bearer(mover)).expect(200);
        const [e1, e2] = await Promise.all([endedH, endedG]);
        expect(e1.status).toBe('FINISHED');
        expect(e2.winnerId).not.toBe(mover.user.id);
      } finally {
        sh.close(); sg.close();
      }
    });
  });
});
