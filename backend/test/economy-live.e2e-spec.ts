import { generateKeyPairSync, sign } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AD_KEYS } from '../src/economy/ad-signature';
import { Player, bearer, createApp, newPlayer } from './helpers';

// Live mode: real signature checks, and no store credentials configured.
process.env.STORE_MODE = 'live';

describe('Economy in live mode', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const keys = { get: async (id: string) => (id === '3335741209' ? publicKey.export({ type: 'spki', format: 'der' }).toString('base64') : null) };

  beforeAll(async () => { app = await createApp((b) => b.overrideProvider(AD_KEYS).useValue(keys)); });
  afterAll(() => { process.env.STORE_MODE = 'fake'; return app.close(); });

  const coins = async (p: Player) => (await http().get('/wallet').set(bearer(p)).expect(200)).body.coins as number;
  /** Builds the callback URL the way AdMob does: signature and key id come last. */
  const signed = (query: string, key = privateKey, keyId = '3335741209') =>
    `/ads/ssv?${query}&signature=${sign('sha256', Buffer.from(query), key).toString('base64url')}&key_id=${keyId}`;
  const q = (p: Player, nonce: string, tx: string) => `ad_network=5450213213286189855&ad_unit=1&custom_data=${nonce}&reward_amount=1&reward_item=coins&timestamp=1700000000000&transaction_id=${tx}&user_id=${p.user.id}`;

  it('pays for a correctly signed callback', async () => {
    const p = await newPlayer(app);
    const { nonce } = (await http().post('/ads/rewarded/start').set(bearer(p)).expect(200)).body;
    expect((await http().get(signed(q(p, nonce, 'live-1'))).expect(200)).body).toEqual({ ok: true, credited: true });
    expect(await coins(p)).toBe(1025);
  });

  it('refuses forged, altered or unsigned callbacks and pays nothing', async () => {
    const p = await newPlayer(app);
    const { nonce } = (await http().post('/ads/rewarded/start').set(bearer(p)).expect(200)).body;
    const good = signed(q(p, nonce, 'live-2'));
    await http().get(good.replace('live-2', 'live-3')).expect(403); // changed after signing
    await http().get(signed(q(p, nonce, 'live-2'), other.privateKey)).expect(403); // signed by someone else
    await http().get(signed(q(p, nonce, 'live-2'), privateKey, 'unknown-key')).expect(403);
    await http().get(`/ads/ssv?${q(p, nonce, 'live-2')}`).expect(403); // no signature
    await http().get(`/ads/ssv?${q(p, nonce, 'live-2')}&signature=%%%&key_id=3335741209`).expect(403);
    expect(await coins(p)).toBe(1000);
    await http().get(good).expect(200); // the genuine one still works afterwards
    expect(await coins(p)).toBe(1025);
  });

  it('says purchases are not set up, instead of crediting, when no store credentials exist', async () => {
    const p = await newPlayer(app);
    for (const platform of ['GOOGLE', 'APPLE']) {
      const r = await http().post('/store/purchases').set(bearer(p)).send({ platform, productId: 'coins_500', token: 'fake:t:coins_500' }).expect(503);
      expect(r.body.error).toBe('STORE_NOT_CONFIGURED');
    }
    expect(await coins(p)).toBe(1000);
  });
});
