import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { drive, newDriver } from '../src/games/apex/bot';
import { MAX_RACE_TICKS, carStats, makeWorld, newRacer, packInput, step } from '../src/games/apex/sim';
import { Player, bearer, createApp, newPlayer, prismaOf } from './helpers';

describe('Matches: Apex race rooms', () => {
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
    const room = (await http().post('/rooms').set(bearer(ps[0])).send({ game: 'APEX', stake, maxPlayers: count }).expect(201)).body;
    for (const p of ps.slice(1)) {
      await http().post('/rooms/join').set(bearer(p)).send({ code: room.code }).expect(200);
      await http().post('/rooms/current/ready').set(bearer(p)).send({ ready: true }).expect(200);
    }
    await http().post('/rooms/current/start').set(bearer(ps[0])).expect(200);
    const match = (await http().get('/matches/current').set(bearer(ps[0])).expect(200)).body;
    const bySeat = (seat: number) => ps.find((p) => p.user.id === match.players.find((x: any) => x.seat === seat).userId)!;
    return { ps, match, bySeat };
  }
  /** What a phone would upload: the controls of a finished race on this match's road. */
  function record(state: { seed: number; level: number; track: string; laps: number; car: string }, skill: number) {
    const world = makeWorld(state.seed, state.level, state.track, state.laps);
    const car = carStats(state.car);
    const r = newRacer(world, car);
    const d = newDriver(state.seed + 5, skill);
    const inputs: number[] = [];
    while (r.finishedAt === 0 && r.tick < MAX_RACE_TICKS) { const i = drive(world, car, r, d); inputs.push(packInput(i)); step(world, car, r, i); }
    return { inputs, ticks: r.finishedAt };
  }
  const finish = (p: Player, m: any, inputs: number[]) => http().post(`/matches/${m.id}/move`).set(bearer(p)).send({ move: { inputs } });

  it('starts a race for friends: one seed, no turns, stakes taken', async () => {
    const { ps, match } = await start(3);
    expect(match).toMatchObject({ game: 'APEX', status: 'ACTIVE', stake: 100, pot: 300, turnSeat: null });
    expect(match.state).toMatchObject({ track: 'circuit', car: 'cts', ticks: [null, null, null] });
    expect(typeof match.state.seed).toBe('number');
    for (const p of ps) expect(await coins(p)).toBe(900);
  });

  it('pays the pot (minus the house cut) to the fastest verified time, and the ledger balances', async () => {
    const { match, bySeat } = await start(2);
    const a = record(match.state, 0.9), b = record(match.state, 0.35);
    expect(a.ticks).not.toBe(b.ticks);
    const first = await finish(bySeat(0), match, a.inputs).expect(200);
    expect(first.body.status).toBe('ACTIVE');
    expect(first.body.state.finished).toEqual([true, false]);
    const last = await finish(bySeat(1), match, b.inputs).expect(200);
    expect(last.body.status).toBe('FINISHED');
    const winSeat = a.ticks < b.ticks ? 0 : 1;
    expect(last.body.winnerId).toBe(bySeat(winSeat).user.id);
    expect(await coins(bySeat(winSeat))).toBe(900 + 180);
    expect(await coins(bySeat(1 - winSeat))).toBe(900);
    expect(await ledgerSum(match.id)).toBe(0n);
  });

  it('refuses a recording that does not finish and a second upload', async () => {
    const { match, bySeat } = await start(2, 0);
    const a = record(match.state, 0.7);
    await finish(bySeat(0), match, a.inputs.slice(0, 30)).expect(400);
    await finish(bySeat(0), match, a.inputs).expect(200);
    await finish(bySeat(0), match, a.inputs).expect(400);
  });

  it('when a driver quits, the rest finish and the race still settles', async () => {
    const { match, bySeat } = await start(3);
    const ra = record(match.state, 0.9), rb = record(match.state, 0.35);
    await finish(bySeat(0), match, ra.inputs).expect(200);
    await http().post(`/matches/${match.id}/forfeit`).set(bearer(bySeat(2))).expect(200);
    const end = await finish(bySeat(1), match, rb.inputs).expect(200);
    expect(end.body.status).toBe('FINISHED');
    expect((await get(bySeat(0), match.id)).players.find((x: any) => x.seat === 2).result).toBe('LOST');
    expect(end.body.winnerId).toBe(bySeat(ra.ticks <= rb.ticks ? 0 : 1).user.id);
    expect(await ledgerSum(match.id)).toBe(0n);
  });

  it('is private: no quick match, and non-members cannot upload', async () => {
    const p = await newPlayer(app);
    await http().post('/matchmaking/queue').set(bearer(p)).send({ game: 'APEX', stake: 0 }).expect(400);
    const { match } = await start(2, 0);
    await finish(p, match, record(match.state, 0.7).inputs).expect(404);
  });
});
