import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MatchesService } from '../src/matches/matches.service';
import { Player, bearer, createApp, newPlayer, prismaOf } from './helpers';
import { solve } from './water-solver';

describe('Matches: Water Sort (solo)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  const coins = async (p: Player) => (await http().get('/wallet').set(bearer(p)).expect(200)).body.coins as number;
  const getMatch = async (p: Player, id: string) => (await http().get(`/matches/${id}`).set(bearer(p)).expect(200)).body;
  const start = (p: Player) => http().post('/matches/solo').set(bearer(p)).send({ game: 'WATER_SORT' });
  const pour = (p: Player, id: string, from: number, to: number) => http().post(`/matches/${id}/move`).set(bearer(p)).send({ move: { from, to } });

  it('starts a puzzle for one player: no room, no stake, a clock, no turns', async () => {
    const p = await newPlayer(app);
    const m = (await start(p).expect(200)).body;
    expect(m).toMatchObject({ game: 'WATER_SORT', stake: 0, pot: 0, status: 'ACTIVE', turnSeat: null, roomId: null });
    expect(m.turnDeadline).toBeTruthy();
    expect(m.players).toHaveLength(1);
    expect(m.state.boards).toHaveLength(1);
    expect(await coins(p)).toBe(1000);
    await http().get('/rooms/current').set(bearer(p)).expect(404);
  });

  it('can be solved, and solving it wins without moving any coins', async () => {
    const p = await newPlayer(app);
    const m = (await start(p).expect(200)).body;
    const path = solve(m.state.boards[0])!;
    expect(path).not.toBeNull();
    let last: any;
    for (const [from, to] of path) last = await pour(p, m.id, from, to).expect(200);
    expect(last.body.status).toBe('FINISHED');
    expect(last.body.players[0]).toMatchObject({ result: 'WON', payout: 0 });
    expect(last.body.winnerId).toBe(p.user.id);
    expect(await coins(p)).toBe(1000);
    expect(await prismaOf(app).ledgerEntry.count({ where: { reference: `match:${m.id}` } })).toBe(0);
    await pour(p, m.id, 0, 1).expect(409); // already over
  });

  it('has levels: solving level 1 opens level 2, which is harder', async () => {
    const p = await newPlayer(app);
    const l1 = (await start(p).expect(200)).body;
    expect(l1.state.level).toBe(1);
    expect(l1.state.boards[0]).toHaveLength(4);
    for (const [from, to] of solve(l1.state.boards[0])!) await pour(p, l1.id, from, to).expect(200);
    const l2 = (await start(p).expect(200)).body;
    expect(l2.state.level).toBe(2);
    // a level cannot be skipped ahead to, but an earlier one can be replayed
    await http().post(`/matches/${l2.id}/forfeit`).set(bearer(p)).expect(200);
    const jump = (await http().post('/matches/solo').set(bearer(p)).send({ game: 'WATER_SORT', level: 50 }).expect(200)).body;
    expect(jump.state.level).toBe(2);
    await http().post(`/matches/${jump.id}/forfeit`).set(bearer(p)).expect(200);
    const again = (await http().post('/matches/solo').set(bearer(p)).send({ game: 'WATER_SORT', level: 1 }).expect(200)).body;
    expect(again.state.level).toBe(1);
  });

  it('can undo, restart and add a tube through the move endpoint', async () => {
    const p = await newPlayer(app);
    const m = (await start(p).expect(200)).body;
    const r = await http().post(`/matches/${m.id}/move`).set(bearer(p)).send({ move: { action: 'addTube' } }).expect(200);
    expect(r.body.state.boards[0]).toHaveLength(m.state.boards[0].length + 1);
    expect(r.body.state.tubesLeft).toBe(1);
    const back = await http().post(`/matches/${m.id}/move`).set(bearer(p)).send({ move: { action: 'restart' } }).expect(200);
    expect(back.body.state.boards).toEqual(m.state.boards);
    expect((await http().post(`/matches/${m.id}/move`).set(bearer(p)).send({ move: { action: 'undo' } }).expect(400)).body.error).toBe('NOTHING_TO_UNDO');
  });

  it('refuses illegal pours with a reason and keeps the board as it was', async () => {
    const p = await newPlayer(app);
    const m = (await start(p).expect(200)).body;
    const empty = m.state.boards[0].findIndex((t: number[]) => t.length === 0);
    const r = await pour(p, m.id, empty, (empty + 1) % m.state.boards[0].length).expect(400);
    expect(r.body.error).toBe('EMPTY_TUBE');
    await pour(p, m.id, 0, 0).expect(400);
    await pour(p, m.id, 0, 99).expect(400);
    expect((await getMatch(p, m.id)).state.boards).toEqual(m.state.boards);
  });

  it('only one live puzzle at a time, and a new one can start after it ends', async () => {
    const p = await newPlayer(app);
    const m = (await start(p).expect(200)).body;
    expect((await start(p).expect(409)).body.error).toBe('ALREADY_IN_MATCH');
    const done = (await http().post(`/matches/${m.id}/forfeit`).set(bearer(p)).expect(200)).body;
    expect(done.status).toBe('FINISHED');
    expect(done.players[0].result).toBe('LOST');
    expect(done.winnerId).toBeNull();
    await start(p).expect(200);
  });

  it('running out of time ends it with no winner', async () => {
    const p = await newPlayer(app);
    const m = (await start(p).expect(200)).body;
    const [a] = solve(m.state.boards[0])!;
    await pour(p, m.id, a[0], a[1]).expect(200); // some progress is not enough
    await app.get(MatchesService).sweepTimeouts(Date.now() + 31 * 60_000);
    const done = await getMatch(p, m.id);
    expect(done).toMatchObject({ status: 'FINISHED', endReason: 'TIMEOUT', winnerId: null });
    expect(done.players[0].result).toBe('LOST');
    expect(await coins(p)).toBe(1000);
  });

  it('is not available as a room or a quick match, and other games are not solo', async () => {
    const p = await newPlayer(app);
    expect((await http().post('/rooms').set(bearer(p)).send({ game: 'WATER_SORT', stake: 0 }).expect(400)).body.error).toBe('SOLO_GAME');
    expect((await http().post('/matchmaking/queue').set(bearer(p)).send({ game: 'WATER_SORT', stake: 0 }).expect(400)).body.error).toBe('SOLO_GAME');
    expect((await http().post('/matches/solo').set(bearer(p)).send({ game: 'LUDO' }).expect(400)).body.error).toBe('NOT_SOLO');
    await http().post('/matches/solo').set(bearer(p)).send({ game: 'NOPE' }).expect(400);
    await http().post('/matches/solo').send({ game: 'WATER_SORT' }).expect(401);
  });
});
