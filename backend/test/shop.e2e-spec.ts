import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Player, bearer, createApp, newPlayer, prismaOf, setCoins } from './helpers';

describe('Cosmetic shop', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  const coins = async (p: Player) => (await http().get('/wallet').set(bearer(p)).expect(200)).body.coins as number;
  const buy = (p: Player, id: string) => http().post(`/shop/items/${id}/buy`).set(bearer(p));
  const equip = (p: Player, id: string) => http().post(`/shop/items/${id}/equip`).set(bearer(p));

  it('lists the catalog with the free theme owned and equipped by default', async () => {
    const p = await newPlayer(app);
    const r = (await http().get('/shop/items').set(bearer(p)).expect(200)).body;
    expect(r.items.length).toBeGreaterThan(10);
    expect(r.items.find((i: any) => i.id === 'theme_midnight').owned).toBe(true);
    expect(r.items.find((i: any) => i.id === 'frame_gold').owned).toBe(false);
    expect(r.equipped).toEqual({ frame: null, title: null, theme: 'theme_midnight' });
    await http().get('/shop/items').expect(401);
  });

  it('buys an item once, debiting coins through the ledger', async () => {
    const p = await newPlayer(app);
    await setCoins(app, p.user.id, 2000);
    const r = (await buy(p, 'frame_gold').expect(200)).body;
    expect(r.balance).toBe(1500);
    expect(await coins(p)).toBe(1500);
    expect(await prismaOf(app).ledgerEntry.count({ where: { wallet: { userId: p.user.id }, type: 'SHOP_PURCHASE' } })).toBe(1);
    expect((await buy(p, 'frame_gold').expect(409)).body.code ?? 'ALREADY_OWNED').toBe('ALREADY_OWNED');
    expect(await coins(p)).toBe(1500);
  });

  it('refuses when the player cannot afford it and gives nothing away', async () => {
    const p = await newPlayer(app);
    await setCoins(app, p.user.id, 100);
    await buy(p, 'title_champion').expect(402);
    expect(await coins(p)).toBe(100);
    expect(await prismaOf(app).userItem.count({ where: { userId: p.user.id } })).toBe(0);
    await equip(p, 'title_champion').expect(403);
  });

  it('rejects unknown items and cannot buy the free theme', async () => {
    const p = await newPlayer(app);
    await buy(p, 'nope').expect(404);
    await buy(p, 'theme_midnight').expect(409);
  });

  it('equips owned items and shows frame and title to other players', async () => {
    const a = await newPlayer(app);
    const b = await newPlayer(app);
    await setCoins(app, a.user.id, 5000);
    await buy(a, 'frame_neon').expect(200);
    await buy(a, 'title_lucky').expect(200);
    await buy(a, 'theme_ocean').expect(200);
    for (const id of ['frame_neon', 'title_lucky', 'theme_ocean']) await equip(a, id).expect(200);
    const eq = (await http().get('/shop/items').set(bearer(a))).body.equipped;
    expect(eq).toEqual({ frame: 'frame_neon', title: 'title_lucky', theme: 'theme_ocean' });

    const room = (await http().post('/rooms').set(bearer(a)).send({ game: 'TICTACTOE', stake: 0 }).expect(201)).body;
    const joined = (await http().post('/rooms/join').set(bearer(b)).send({ code: room.code }).expect(200)).body;
    const me = joined.members.find((m: any) => m.userId === a.user.id);
    expect(me.frame).toBe('frame_neon');
    expect(me.title).toBe('title_lucky');

    await http().post('/shop/unequip/frame').set(bearer(a)).expect(200);
    await http().post('/shop/unequip/bogus').set(bearer(a)).expect(400);
    expect((await http().get('/shop/items').set(bearer(a))).body.equipped.frame).toBeNull();
  });

  it('only one of two simultaneous purchases of the same item succeeds', async () => {
    const p = await newPlayer(app);
    await setCoins(app, p.user.id, 5000);
    const res = await Promise.all([buy(p, 'frame_fire'), buy(p, 'frame_fire')]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await coins(p)).toBe(3800);
  });
});
