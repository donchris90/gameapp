import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Player, bearer, createApp, newPlayer, prismaOf } from './helpers';

describe('Matches: Whot', () => {
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
    const room = (await http().post('/rooms').set(bearer(ps[0])).send({ game: 'WHOT', stake, maxPlayers: count }).expect(201)).body;
    for (const p of ps.slice(1)) {
      await http().post('/rooms/join').set(bearer(p)).send({ code: room.code }).expect(200);
      await http().post('/rooms/current/ready').set(bearer(p)).send({ ready: true }).expect(200);
    }
    await http().post('/rooms/current/start').set(bearer(ps[0])).expect(200);
    const match = (await http().get('/matches/current').set(bearer(ps[0])).expect(200)).body;
    const bySeat = (seat: number) => ps.find((p) => p.user.id === match.players.find((x: any) => x.seat === seat).userId)!;
    return { ps, match, bySeat };
  }

  it('deals 6 each, shows each player only their own hand, and takes the stakes', async () => {
    const { ps, match, bySeat } = await start(3);
    expect(match).toMatchObject({ game: 'WHOT', status: 'ACTIVE', stake: 100, pot: 300 });
    expect(match.state.counts).toEqual([6, 6, 6]);
    expect(match.state.hand).toHaveLength(6);
    for (const p of ps) expect(await coins(p)).toBe(900);
    const seats = [0, 1, 2];
    const views = await Promise.all(seats.map((s) => get(bySeat(s), match.id)));
    views.forEach((v, s) => { expect(v.state.seat).toBe(s); expect(v.state.hand).toHaveLength(6); });
    expect(JSON.stringify(views[0].state.hand)).not.toBe(JSON.stringify(views[1].state.hand));
    expect(JSON.stringify(views[0])).not.toContain(JSON.stringify(views[1].state.hand));
  });

  it('plays a whole game by the rules; the winner takes the pot and the ledger balances', async () => {
    const { match, bySeat } = await start(2);
    let m = match;
    for (let i = 0; i < 900 && m.status === 'ACTIVE'; i++) {
      const turn = m.state.turn;
      const me = bySeat(turn);
      const v = await get(me, m.id);
      const move = v.state.canPlay.length ? { action: 'play', card: v.state.canPlay[0] } : { action: 'draw' };
      // a card that cannot be played is refused
      if (v.state.canPlay.length < v.state.hand.length) {
        const bad = v.state.hand.findIndex((_: unknown, k: number) => !v.state.canPlay.includes(k));
        await http().post(`/matches/${m.id}/move`).set(bearer(me)).send({ version: v.version, move: { action: 'play', card: bad } }).expect(400);
      }
      if (v.state.canPlay.length > 0 && v.state.pending === 0) await http().post(`/matches/${m.id}/move`).set(bearer(me)).send({ version: v.version, move: { action: 'draw' } }).expect(400);
      const out = await http().post(`/matches/${m.id}/move`).set(bearer(me)).send({ version: v.version, move }).expect(200);
      m = out.body;
    }
    expect(m.status).toBe('FINISHED');
    const winner = bySeat(m.state.counts.findIndex((n: number) => n === 0));
    expect(m.winnerId).toBe(winner.user.id);
    expect(await coins(winner)).toBe(900 + 180);
    expect(await ledgerSum(m.id)).toBe(0n);
  });

  it('refuses a move out of turn', async () => {
    const { match, bySeat } = await start(2, 0);
    const other = bySeat(1 - match.state.turn);
    await http().post(`/matches/${match.id}/move`).set(bearer(other)).send({ version: match.version, move: { action: 'draw' } }).expect(409);
  });
});
