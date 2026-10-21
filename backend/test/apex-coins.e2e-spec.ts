import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Player, bearer, createApp, newPlayer } from './helpers';

describe('Apex coins use the shared wallet', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());
  const coins = async (p: Player) => (await http().get('/wallet').set(bearer(p)).expect(200)).body.coins as number;
  const earn = (p: Player, amount: number, key: string) => http().post('/wallet/apex/earn').set(bearer(p)).send({ amount, key });
  const spend = (p: Player, amount: number, key: string) => http().post('/wallet/apex/spend').set(bearer(p)).send({ amount, key, item: 'car:test' });

  it('adds Apex winnings to the general balance, once per key', async () => {
    const p = await newPlayer(app);
    const before = await coins(p);
    const r = await earn(p, 400, 'race-aaaa-1').expect(201);
    expect(r.body).toEqual({ credited: 400, coins: before + 400 });
    await earn(p, 400, 'race-aaaa-1').expect(201); // retry after a lost response
    expect(await coins(p)).toBe(before + 400);
    await earn(p, 500, 'race-aaaa-1').expect(201); // same key again never pays more
    expect(await coins(p)).toBe(before + 400);
  });

  it('spends from the same balance and refuses when short', async () => {
    const p = await newPlayer(app);
    const before = await coins(p);
    await spend(p, 100, 'buy-aaaa-1').expect(201);
    await spend(p, 100, 'buy-aaaa-1').expect(201);
    expect(await coins(p)).toBe(before - 100);
    await spend(p, before + 1, 'buy-aaaa-2').expect(402);
    expect(await coins(p)).toBe(before - 100);
  });

  it('caps what one account can bring in per day and per payout', async () => {
    const p = await newPlayer(app);
    const before = await coins(p);
    await earn(p, 5001, 'race-big-1').expect(400);
    await earn(p, 0, 'race-zero-1').expect(400);
    await earn(p, 5, 'x').expect(400);
    for (let i = 0; i < 4; i++) await earn(p, 5000, `race-day-${i}`).expect(201);
    const over = await earn(p, 3000, 'race-day-over').expect(201);
    expect(over.body.credited).toBe(0);
    expect(await coins(p)).toBe(before + 20000);
  });

  it('moves an older local balance in once, with its own cap', async () => {
    const p = await newPlayer(app);
    const before = await coins(p);
    await earn(p, 30000, 'legacy-import').expect(201);
    await earn(p, 30000, 'legacy-import').expect(201);
    expect(await coins(p)).toBe(before + 30000);
    await earn(p, 60000, 'legacy-import').expect(400);
  });

  it('needs a login', async () => {
    await http().post('/wallet/apex/earn').send({ amount: 1, key: 'race-anon-1' }).expect(401);
  });
});
