import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LudoState } from '../src/games/ludo.engine';
import { MatchesService } from '../src/matches/matches.service';
import { Player, bearer, createApp, newPlayer, prismaOf } from './helpers';

describe('Matches: Ludo', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  const coins = async (p: Player) => (await http().get('/wallet').set(bearer(p)).expect(200)).body.coins as number;
  const get = async (p: Player, id: string) => (await http().get(`/matches/${id}`).set(bearer(p)).expect(200)).body;
  const ledgerSum = async (id: string) =>
    (await prismaOf(app).$queryRaw<Array<{ s: bigint }>>`SELECT COALESCE(SUM("amount"),0)::bigint AS s FROM "LedgerEntry" WHERE "reference" = ${`match:${id}`}`)[0].s;

  async function start(count: number, stake = 100) {
    const ps = await Promise.all(Array.from({ length: count }, () => newPlayer(app)));
    const room = (await http().post('/rooms').set(bearer(ps[0])).send({ game: 'LUDO', stake, maxPlayers: count }).expect(201)).body;
    for (const p of ps.slice(1)) {
      await http().post('/rooms/join').set(bearer(p)).send({ code: room.code }).expect(200);
      await http().post('/rooms/current/ready').set(bearer(p)).send({ ready: true }).expect(200);
    }
    await http().post('/rooms/current/start').set(bearer(ps[0])).expect(200);
    const match = (await http().get('/matches/current').set(bearer(ps[0])).expect(200)).body;
    const bySeat = (seat: number) => ps.find((p) => p.user.id === match.players.find((x: any) => x.seat === seat).userId)!;
    return { ps, match, bySeat };
  }
  const act = (p: Player, m: any, move: object) => http().post(`/matches/${m.id}/move`).set(bearer(p)).send({ version: m.version, move });
  const forceState = async (id: string, patch: Partial<LudoState>) => {
    const row = await prismaOf(app).match.findUniqueOrThrow({ where: { id } });
    const state = { ...(row.state as any), ...patch };
    await prismaOf(app).match.update({ where: { id }, data: { state, turnSeat: state.turn, version: { increment: 1 } } });
  };

  it('starts a four player table: everyone pays in, tokens in the yards, someone is on the clock', async () => {
    const g = await start(4, 100);
    expect(g.match).toMatchObject({ game: 'LUDO', pot: 400, status: 'ACTIVE' });
    expect(g.match.state).toMatchObject({ phase: 'ROLL', dice: null, canMove: [], ring: 52 });
    expect(g.match.state.tokens).toEqual(Array(4).fill([-1, -1, -1, -1]));
    expect(g.match.turnDeadline).toBeTruthy();
    for (const p of g.ps) expect(await coins(p)).toBe(900);
  });

  it('the server rolls the dice, and the order roll then move is enforced', async () => {
    const g = await start(2, 0);
    let m = g.match;
    const mover = g.bySeat(m.turnSeat), other = g.bySeat(1 - m.turnSeat);
    expect((await act(mover, m, { action: 'move', token: 0 }).expect(400)).body.error).toBe('ROLL_FIRST');
    expect((await act(other, m, { action: 'roll' }).expect(409)).body.error).toBe('NOT_YOUR_TURN');
    m = (await act(mover, m, { action: 'roll' }).expect(200)).body;
    const value = m.state.lastRoll.value;
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(6);
    if (m.state.phase === 'MOVE') {
      expect(m.state.dice).toBe(value);
      expect(m.state.canMove.length).toBeGreaterThan(0);
      expect((await act(mover, m, { action: 'roll' }).expect(400)).body.error).toBe('MOVE_FIRST');
      const bad = [0, 1, 2, 3].find((t) => !m.state.canMove.includes(t));
      if (bad !== undefined) expect((await act(mover, m, { action: 'move', token: bad }).expect(400)).body.error).toBe('ILLEGAL_TOKEN');
    } else {
      expect(m.state.lastRoll.skipped).toBe('NO_MOVE'); // no six: the turn passed
      expect(m.turnSeat).not.toBeNull();
    }
    const current = g.bySeat(m.turnSeat);
    await act(current, m, { action: 'fly' }).expect(400);
    await http().post(`/matches/${m.id}/move`).set(bearer(current)).send({ move: { action: 'roll' } }).expect(400); // version is required
  });

  it('pays the first to bring all four tokens home: pot minus 10%, ledger balanced', async () => {
    const g = await start(4, 100);
    const seat = g.match.turnSeat, winner = g.bySeat(seat);
    const tokens = g.match.state.tokens.map((t: number[], s: number) => (s === seat ? [56, 56, 56, 55] : t));
    await forceState(g.match.id, { tokens, phase: 'MOVE', dice: 1 });
    const m = await get(winner, g.match.id);
    expect(m.state.canMove).toEqual([3]);
    const done = (await act(winner, m, { action: 'move', token: 3 }).expect(200)).body;
    expect(done).toMatchObject({ status: 'FINISHED', endReason: 'NORMAL', winnerId: winner.user.id, houseFee: 40 });
    expect(await coins(winner)).toBe(900 + 360);
    for (const p of g.ps.filter((x) => x !== winner)) expect(await coins(p)).toBe(900);
    expect(await ledgerSum(done.id)).toBe(0n);
  });

  it('a player who leaves a four player table is out, the others play on', async () => {
    const g = await start(4, 100);
    const onClock = g.bySeat(g.match.turnSeat);
    await http().post(`/matches/${g.match.id}/forfeit`).set(bearer(onClock)).expect(200);
    const m = await get(g.ps.find((p) => p !== onClock)!, g.match.id);
    expect(m.status).toBe('ACTIVE');
    expect(m.state.left).toEqual([g.match.turnSeat]);
    expect(m.turnSeat).not.toBe(g.match.turnSeat); // the turn moved on
    expect(m.players.filter((p: any) => p.left)).toHaveLength(1);
    const late = g.bySeat(m.turnSeat);
    await act(onClock, m, { action: 'roll' }).expect(409); // the one who left cannot play
    expect(late).toBeDefined();
  });

  it('when everyone but one has left, the last player wins the pot', async () => {
    const g = await start(3, 100);
    const order = [0, 1, 2].map((s) => g.bySeat(s));
    await http().post(`/matches/${g.match.id}/forfeit`).set(bearer(order[1])).expect(200);
    await http().post(`/matches/${g.match.id}/forfeit`).set(bearer(order[2])).expect(200);
    const m = await get(order[0], g.match.id);
    expect(m).toMatchObject({ status: 'FINISHED', winnerId: order[0].user.id, houseFee: 30 });
    expect(await coins(order[0])).toBe(900 + 270);
    expect(await ledgerSum(m.id)).toBe(0n);
  });

  it('a player who runs out of time is removed and the game goes on with the rest', async () => {
    const g = await start(3, 100);
    const late = g.bySeat(g.match.turnSeat);
    await app.get(MatchesService).sweepTimeouts(Date.now() + 120_000);
    const m = await get(g.ps.find((p) => p !== late)!, g.match.id);
    expect(m.status).toBe('ACTIVE');
    expect(m.state.left).toEqual([g.match.turnSeat]);
    expect(await coins(late)).toBe(900);
    // each action resets the clock for the next player
    expect(new Date(m.turnDeadline).getTime()).toBeGreaterThan(Date.now());
  });

  it('two players: leaving gives the other the win', async () => {
    const g = await start(2, 100);
    await http().post('/rooms/current/leave').set(bearer(g.ps[1])).expect(200);
    const m = await get(g.ps[0], g.match.id);
    expect(m).toMatchObject({ status: 'FINISHED', winnerId: g.ps[0].user.id });
    expect(await ledgerSum(m.id)).toBe(0n);
  });

  it('a long stretch of play keeps every token within the rules', async () => {
    const g = await start(2, 0);
    let m = g.match;
    for (let i = 0; i < 80 && m.status === 'ACTIVE'; i++) {
      const p = g.bySeat(m.turnSeat);
      m = (await act(p, m, m.state.phase === 'ROLL' ? { action: 'roll' } : { action: 'move', token: m.state.canMove[0] }).expect(200)).body;
      for (const row of m.state.tokens) for (const t of row) { expect(t).toBeGreaterThanOrEqual(-1); expect(t).toBeLessThanOrEqual(56); }
    }
    expect(m.state.moves).toBeGreaterThan(0);
  });
});
