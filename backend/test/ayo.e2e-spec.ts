import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { legalMoves } from '../src/games/ayo.engine';
import { MatchesService } from '../src/matches/matches.service';
import { Player, bearer, createApp, newPlayer, prismaOf } from './helpers';

describe('Matches: Ayo', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  const coins = async (p: Player) => (await http().get('/wallet').set(bearer(p)).expect(200)).body.coins as number;
  const ledgerSum = async (id: string) =>
    (await prismaOf(app).$queryRaw<Array<{ s: bigint }>>`SELECT COALESCE(SUM("amount"),0)::bigint AS s FROM "LedgerEntry" WHERE "reference" = ${`match:${id}`}`)[0].s;

  async function start(stake = 100) {
    const host = await newPlayer(app), guest = await newPlayer(app);
    const room = (await http().post('/rooms').set(bearer(host)).send({ game: 'AYO', stake }).expect(201)).body;
    await http().post('/rooms/join').set(bearer(guest)).send({ code: room.code }).expect(200);
    await http().post('/rooms/current/ready').set(bearer(guest)).send({ ready: true }).expect(200);
    await http().post('/rooms/current/start').set(bearer(host)).expect(200);
    const match = (await http().get('/matches/current').set(bearer(host)).expect(200)).body;
    const bySeat = (seat: number) => (match.players.find((p: any) => p.seat === seat).userId === host.user.id ? host : guest);
    return { host, guest, match, bySeat };
  }
  const play = (p: Player, m: any, pit: number) =>
    http().post(`/matches/${m.id}/move`).set(bearer(p)).send({ version: m.version, move: { pit } });

  it('starts with 4 seeds per pit and takes both stakes', async () => {
    const g = await start(100);
    expect(g.match).toMatchObject({ game: 'AYO', pot: 200, status: 'ACTIVE' });
    expect(g.match.state.pits).toEqual(Array(12).fill(4));
    expect(g.match.state.captured).toEqual([0, 0]);
    expect(await coins(g.host)).toBe(900);
  });

  it('plays a whole game to the end and pays out with a balanced ledger', async () => {
    const g = await start(100);
    let m = g.match;
    for (let i = 0; i < 500 && m.status === 'ACTIVE'; i++) {
      const moves = legalMoves(m.state.pits, m.turnSeat);
      m = (await play(g.bySeat(m.turnSeat), m, moves[(i * 7) % moves.length]).expect(200)).body;
      expect(m.state.pits.reduce((a: number, b: number) => a + b, 0) + m.state.captured[0] + m.state.captured[1]).toBe(48);
    }
    expect(m.status).toBe('FINISHED');
    expect(await ledgerSum(m.id)).toBe(0n);
    const [c0, c1] = m.state.captured;
    if (c0 === c1) {
      expect(m.winnerId).toBeNull();
      expect(await coins(g.host)).toBe(1000);
      expect(await coins(g.guest)).toBe(1000);
    } else {
      const winner = g.bySeat(c0 > c1 ? 0 : 1), loser = g.bySeat(c0 > c1 ? 1 : 0);
      expect(m.winnerId).toBe(winner.user.id);
      expect(await coins(winner)).toBe(1080);
      expect(await coins(loser)).toBe(900);
    }
  }, 60000);

  it('enforces turns, row ownership, empty pits and bad input', async () => {
    const g = await start(0);
    const mover = g.bySeat(g.match.turnSeat), other = mover === g.host ? g.guest : g.host;
    const mine = g.match.turnSeat === 0 ? 0 : 6, theirs = g.match.turnSeat === 0 ? 6 : 0;
    expect((await play(other, g.match, theirs).expect(409)).body.error).toBe('NOT_YOUR_TURN');
    expect((await play(mover, g.match, theirs).expect(400)).body.error).toBe('NOT_YOUR_PIT');
    expect((await play(mover, g.match, 12).expect(400)).body.error).toBe('BAD_MOVE');
    const m2 = (await play(mover, g.match, mine).expect(200)).body;
    expect(m2.state.pits[mine]).toBe(0);
    expect(m2.state.last).toMatchObject({ seat: g.match.turnSeat, pit: mine });
    expect((await play(other, m2, m2.turnSeat === 0 ? 0 : 6).expect(200)).body.version).toBe(3);
    // the emptied pit cannot be played again
    const m3 = (await http().get(`/matches/${g.match.id}`).set(bearer(mover)).expect(200)).body;
    if (m3.turnSeat === g.match.turnSeat) expect((await play(mover, m3, mine).expect(400)).body.error).toBe('EMPTY_PIT');
  });

  it('forfeits and timeouts pay the opponent', async () => {
    const g = await start(100);
    await http().post(`/matches/${g.match.id}/forfeit`).set(bearer(g.host)).expect(200);
    expect(await coins(g.guest)).toBe(1080);

    const t = await start(100);
    const late = t.bySeat(t.match.turnSeat), other = late === t.host ? t.guest : t.host;
    await app.get(MatchesService).sweepTimeouts(Date.now() + 60_000);
    expect(await coins(other)).toBe(1080);
    expect(await ledgerSum(t.match.id)).toBe(0n);
  });

  it('works through quick match', async () => {
    const a = await newPlayer(app), b = await newPlayer(app);
    await http().post('/matchmaking/queue').set(bearer(a)).send({ game: 'AYO', stake: 50 }).expect(200);
    await http().post('/matchmaking/queue').set(bearer(b)).send({ game: 'AYO', stake: 50 }).expect(200);
    let m: any;
    for (let i = 0; i < 100 && !m; i++) {
      const r = await http().get('/matches/current').set(bearer(a));
      if (r.status === 200) m = r.body; else await new Promise((res) => setTimeout(res, 25));
    }
    expect(m).toMatchObject({ game: 'AYO', pot: 100 });
  });
});
