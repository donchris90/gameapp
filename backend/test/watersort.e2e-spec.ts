import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MatchesService } from '../src/matches/matches.service';
import { Player, bearer, createApp, newPlayer, prismaOf } from './helpers';
import { solve } from './water-solver';

describe('Matches: Water Sort race', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  const coins = async (p: Player) => (await http().get('/wallet').set(bearer(p)).expect(200)).body.coins as number;
  const getMatch = async (p: Player, id: string) => (await http().get(`/matches/${id}`).set(bearer(p)).expect(200)).body;
  const ledgerSum = async (id: string) =>
    (await prismaOf(app).$queryRaw<Array<{ s: bigint }>>`SELECT COALESCE(SUM("amount"),0)::bigint AS s FROM "LedgerEntry" WHERE "reference" = ${`match:${id}`}`)[0].s;

  async function startRace(count = 2, stake = 100) {
    const ps = await Promise.all(Array.from({ length: count }, () => newPlayer(app)));
    const room = (await http().post('/rooms').set(bearer(ps[0])).send({ game: 'WATER_SORT', stake, maxPlayers: count }).expect(201)).body;
    for (const p of ps.slice(1)) {
      await http().post('/rooms/join').set(bearer(p)).send({ code: room.code }).expect(200);
      await http().post('/rooms/current/ready').set(bearer(p)).send({ ready: true }).expect(200);
    }
    await http().post('/rooms/current/start').set(bearer(ps[0])).expect(200);
    const match = (await http().get('/matches/current').set(bearer(ps[0])).expect(200)).body;
    const seatOf = (p: Player) => match.players.find((x: any) => x.userId === p.user.id).seat as number;
    return { ps, match, seatOf };
  }

  const pour = (p: Player, id: string, from: number, to: number) =>
    http().post(`/matches/${id}/move`).set(bearer(p)).send({ move: { from, to } });

  /** Plays out a full solution for this player's own board. */
  async function solveFor(p: Player, match: any, seat: number, stopBefore = 0) {
    const path = solve(match.state.boards[seat])!;
    expect(path).not.toBeNull();
    let last: any;
    for (const [from, to] of path.slice(0, path.length - stopBefore)) last = await pour(p, match.id, from, to).expect(200);
    return { path, last: last?.body };
  }

  it('starts with the same puzzle for everyone, no turns, and one clock for the match', async () => {
    const { match, ps } = await startRace(3);
    expect(match).toMatchObject({ game: 'WATER_SORT', stake: 100, pot: 300, status: 'ACTIVE', turnSeat: null });
    expect(match.turnDeadline).toBeTruthy();
    expect(match.state.boards).toHaveLength(3);
    expect(match.state.boards[1]).toEqual(match.state.boards[0]);
    expect(match.state.finished).toEqual([0, 0, 0]);
    for (const p of ps) expect(await coins(p)).toBe(900);
  });

  it('lets everyone move at the same time without version numbers or turns', async () => {
    const { match, ps, seatOf } = await startRace(2, 0);
    const [a, b] = ps;
    const pa = solve(match.state.boards[seatOf(a)])!, pb = solve(match.state.boards[seatOf(b)])!;
    await pour(a, match.id, pa[0][0], pa[0][1]).expect(200);
    await pour(b, match.id, pb[0][0], pb[0][1]).expect(200);
    await pour(a, match.id, pa[1][0], pa[1][1]).expect(200);
    const m = await getMatch(a, match.id);
    expect(m.state.moves[seatOf(a)]).toBe(2);
    expect(m.state.moves[seatOf(b)]).toBe(1);
    expect(m.turnDeadline).toBe(match.turnDeadline); // moving does not extend the clock
  });

  it('pays the first to finish: pot minus 10%, house cut booked, ledger balanced', async () => {
    const { match, ps, seatOf } = await startRace(2, 100);
    const [fast, slow] = ps;
    const { last } = await solveFor(fast, match, seatOf(fast));
    expect(last).toMatchObject({ status: 'FINISHED', endReason: 'NORMAL', winnerId: fast.user.id, houseFee: 20 });
    expect(last.state.solvedBy).toBe(seatOf(fast));
    expect(await coins(fast)).toBe(1080);
    expect(await coins(slow)).toBe(900);
    expect(await ledgerSum(match.id)).toBe(0n);
    expect((await http().get('/rooms/current').set(bearer(slow)).expect(200)).body.status).toBe('WAITING');
  });

  it('rejects moves once someone has won', async () => {
    const { match, ps, seatOf } = await startRace(2, 0);
    await solveFor(ps[0], match, seatOf(ps[0]));
    const r = await pour(ps[1], match.id, 0, 1).expect(409);
    expect(r.body.error).toBe('MATCH_OVER');
  });

  it('refuses illegal pours with a reason, and keeps your board as it was', async () => {
    const { match, ps, seatOf } = await startRace(2, 0);
    const p = ps[0], board = match.state.boards[seatOf(p)];
    const empty = board.findIndex((t: number[]) => t.length === 0);
    const full = board.findIndex((t: number[]) => t.length === 4);
    expect((await pour(p, match.id, empty, full).expect(400)).body.error).toBe('EMPTY_TUBE');
    expect((await pour(p, match.id, 0, 0).expect(400)).body.error).toBe('BAD_MOVE');
    expect((await pour(p, match.id, 0, 99).expect(400)).body.error).toBe('BAD_MOVE');
    await http().post(`/matches/${match.id}/move`).set(bearer(p)).send({ move: 'nope' }).expect(400);
    await http().post(`/matches/${match.id}/move`).set(bearer(p)).send({ move: { from: 0, to: 1 }, extra: 1 }).expect(400);
    const outsider = await newPlayer(app);
    await pour(outsider, match.id, 0, 1).expect(404);
    const after = await getMatch(p, match.id);
    expect(after.state.boards[seatOf(p)]).toEqual(board);
    expect(after.state.moves).toEqual([0, 0]);
  });

  it('does not let you touch an opponent’s board', async () => {
    const { match, ps, seatOf } = await startRace(2, 0);
    const [a, b] = ps;
    const path = solve(match.state.boards[seatOf(a)])!;
    await pour(a, match.id, path[0][0], path[0][1]).expect(200);
    const m = await getMatch(b, match.id);
    expect(m.state.boards[seatOf(b)]).toEqual(match.state.boards[seatOf(b)]);
    expect(m.state.boards[seatOf(a)]).not.toEqual(match.state.boards[seatOf(a)]);
  });

  it('settles once when two players finish at the same moment', async () => {
    const { match, ps, seatOf } = await startRace(2, 100);
    const [a, b] = ps;
    const pa = (await solveFor(a, match, seatOf(a), 1)).path, pb = (await solveFor(b, match, seatOf(b), 1)).path;
    const lastA = pa[pa.length - 1], lastB = pb[pb.length - 1];
    const [ra, rb] = await Promise.all([pour(a, match.id, lastA[0], lastA[1]), pour(b, match.id, lastB[0], lastB[1])]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const m = await getMatch(a, match.id);
    expect(m.status).toBe('FINISHED');
    expect(await prismaOf(app).ledgerEntry.count({ where: { reference: `match:${match.id}`, type: 'GAME_PAYOUT' } })).toBe(1);
    expect(await ledgerSum(match.id)).toBe(0n);
    expect(await coins(a) + await coins(b)).toBe(2000 - 20);
  });

  describe('when time runs out', () => {
    it('the player with the most finished tubes wins', async () => {
      const { match, ps, seatOf } = await startRace(2, 100);
      const [ahead, behind] = ps;
      const path = solve(match.state.boards[seatOf(ahead)])!;
      let m: any = match;
      for (const [f, t] of path) {
        m = (await pour(ahead, match.id, f, t).expect(200)).body;
        if (m.state.finished[seatOf(ahead)] >= 2) break;
      }
      expect(m.state.finished[seatOf(ahead)]).toBeGreaterThanOrEqual(1);
      const matches = app.get(MatchesService);
      await matches.sweepTimeouts(Date.now() + 60_000);
      expect((await getMatch(ahead, match.id)).status).toBe('ACTIVE'); // still inside the 5 minutes
      await matches.sweepTimeouts(Date.now() + 6 * 60_000);
      const end = await getMatch(ahead, match.id);
      expect(end).toMatchObject({ status: 'FINISHED', endReason: 'TIMEOUT', winnerId: ahead.user.id, houseFee: 20 });
      expect(await coins(ahead)).toBe(1080);
      expect(await coins(behind)).toBe(900);
      expect(await ledgerSum(match.id)).toBe(0n);
    });

    it('a tie refunds every stake', async () => {
      const { match, ps } = await startRace(2, 250);
      await app.get(MatchesService).sweepTimeouts(Date.now() + 6 * 60_000);
      const end = await getMatch(ps[0], match.id);
      expect(end).toMatchObject({ status: 'FINISHED', endReason: 'TIMEOUT', winnerId: null, houseFee: 0 });
      for (const p of ps) expect(await coins(p)).toBe(1000);
      expect(await ledgerSum(match.id)).toBe(0n);
    });
  });

  describe('leaving', () => {
    it('with two players, giving up hands the pot to the other', async () => {
      const { match, ps } = await startRace(2, 100);
      await http().post(`/matches/${match.id}/forfeit`).set(bearer(ps[0])).expect(200);
      expect(await getMatch(ps[1], match.id)).toMatchObject({ status: 'FINISHED', winnerId: ps[1].user.id });
      expect(await coins(ps[1])).toBe(1080);
      expect(await ledgerSum(match.id)).toBe(0n);
    });

    it('with three players, the race goes on without the one who left and the clock is unchanged', async () => {
      const { match, ps, seatOf } = await startRace(3, 100);
      await http().post(`/matches/${match.id}/forfeit`).set(bearer(ps[2])).expect(200);
      const mid = await getMatch(ps[0], match.id);
      expect(mid.status).toBe('ACTIVE');
      expect(mid.turnDeadline).toBe(match.turnDeadline);
      await pour(ps[2], match.id, 0, 1).expect(409); // the one who left cannot play on
      const { last } = await solveFor(ps[1], match, seatOf(ps[1]));
      expect(last).toMatchObject({ status: 'FINISHED', winnerId: ps[1].user.id, houseFee: 30 });
      expect(await coins(ps[1])).toBe(900 + 270);
      expect(await coins(ps[2])).toBe(900);
      expect(await ledgerSum(match.id)).toBe(0n);
    });

    it('on time-out, a player who already left cannot win it by progress', async () => {
      const { match, ps, seatOf } = await startRace(3, 100);
      const leaver = ps[0];
      const path = solve(match.state.boards[seatOf(leaver)])!;
      for (const [f, t] of path.slice(0, 12)) await pour(leaver, match.id, f, t).expect(200);
      await http().post(`/matches/${match.id}/forfeit`).set(bearer(leaver)).expect(200);
      await app.get(MatchesService).sweepTimeouts(Date.now() + 6 * 60_000);
      const end = await getMatch(ps[1], match.id);
      expect(end.status).toBe('FINISHED');
      expect(end.winnerId).not.toBe(leaver.user.id);
      expect(await ledgerSum(match.id)).toBe(0n);
    });
  });

  it('works through quick match too', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    await http().post('/matchmaking/queue').set(bearer(a)).send({ game: 'WATER_SORT', stake: 50, size: 2 }).expect(200);
    await http().post('/matchmaking/queue').set(bearer(b)).send({ game: 'WATER_SORT', stake: 50, size: 2 }).expect(200);
    let m: any;
    for (let i = 0; i < 100 && !m; i++) {
      const r = await http().get('/matches/current').set(bearer(a));
      if (r.status === 200) m = r.body; else await new Promise((res) => setTimeout(res, 25));
    }
    expect(m).toMatchObject({ game: 'WATER_SORT', pot: 100, turnSeat: null });
    expect(await coins(a)).toBe(950);
  });
});
