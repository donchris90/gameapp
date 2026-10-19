import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MatchesService } from '../src/matches/matches.service';
import { Player, bearer, createApp, newPlayer, prismaOf } from './helpers';

describe('Matches: a computer plays your turn when you time out', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => { delete process.env.AUTOPLAY_MAX_STEPS; return app.close(); });
  const coins = async (p: Player) => (await http().get('/wallet').set(bearer(p)).expect(200)).body.coins as number;

  async function start(stake: number) {
    const host = await newPlayer(app), guest = await newPlayer(app);
    const room = (await http().post('/rooms').set(bearer(host)).send({ game: 'TICTACTOE', stake }).expect(201)).body;
    await http().post('/rooms/join').set(bearer(guest)).send({ code: room.code }).expect(200);
    await http().post('/rooms/current/ready').set(bearer(guest)).send({ ready: true }).expect(200);
    await http().post('/rooms/current/start').set(bearer(host)).expect(200);
    const match = (await http().get('/matches/current').set(bearer(host)).expect(200)).body;
    const bySeat = (seat: number) => (match.players.find((p: any) => p.seat === seat).userId === host.user.id ? host : guest);
    return { host, guest, match, bySeat };
  }

  it('plays the late move instead of forfeiting, and the player takes over again on return', async () => {
    process.env.AUTOPLAY_MAX_STEPS = '5';
    const g = await start(100);
    const late = g.bySeat(g.match.turnSeat);
    await app.get(MatchesService).sweepTimeouts(Date.now() + 60_000);
    let m = (await http().get(`/matches/${g.match.id}`).set(bearer(late)).expect(200)).body;
    expect(m.status).toBe('ACTIVE');
    expect(m.state.board.filter((c: number | null) => c !== null)).toHaveLength(1); // a move was made for them
    expect(m.autoPlay).toEqual([late.user.id]);
    expect(await coins(late)).toBe(900); // stake still held, nobody has lost anything yet

    // the opponent plays, then the returning player moves for themselves: auto-play switches off
    const other = late === g.host ? g.guest : g.host;
    const free = (b: Array<number | null>) => b.findIndex((c) => c === null);
    await http().post(`/matches/${m.id}/move`).set(bearer(other)).send({ version: m.version, move: { cell: free(m.state.board) } }).expect(200);
    m = (await http().get(`/matches/${m.id}`).set(bearer(late)).expect(200)).body;
    await http().post(`/matches/${m.id}/move`).set(bearer(late)).send({ version: m.version, move: { cell: free(m.state.board) } }).expect(200);
    m = (await http().get(`/matches/${m.id}`).set(bearer(late)).expect(200)).body;
    expect(m.autoPlay).toEqual([]);
  });

  it('lets the player take the turns back with one call', async () => {
    process.env.AUTOPLAY_MAX_STEPS = '5';
    const g = await start(0);
    const late = g.bySeat(g.match.turnSeat);
    await app.get(MatchesService).sweepTimeouts(Date.now() + 60_000);
    const m = (await http().post(`/matches/${g.match.id}/resume`).set(bearer(late)).expect(200)).body;
    expect(m.autoPlay).toEqual([]);
    expect(m.status).toBe('ACTIVE');
  });

  it('forfeits only after the allowed number of automatic turns', async () => {
    process.env.AUTOPLAY_MAX_STEPS = '1';
    const g = await start(100);
    const svc = app.get(MatchesService);
    await svc.sweepTimeouts(Date.now() + 60_000); // auto move for the late player
    const other = g.bySeat(g.match.turnSeat) === g.host ? g.guest : g.host;
    const m = (await http().get(`/matches/${g.match.id}`).set(bearer(other)).expect(200)).body;
    await http().post(`/matches/${m.id}/move`).set(bearer(other)).send({ version: m.version, move: { cell: m.state.board.findIndex((c: number | null) => c === null) } }).expect(200);
    await svc.sweepTimeouts(Date.now() + 120_000); // out of allowance: the old rule applies
    const end = (await http().get(`/matches/${g.match.id}`).set(bearer(other)).expect(200)).body;
    expect(end.status).toBe('FINISHED');
    expect(end.winnerId).toBe(other.user.id);
    expect(await coins(other)).toBe(1080);
    void prismaOf;
  });
});
