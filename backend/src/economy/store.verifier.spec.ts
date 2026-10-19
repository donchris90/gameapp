import { createVerify, generateKeyPairSync } from 'crypto';
import { AppleStoreVerifier, FakeStoreVerifier, GooglePlayVerifier } from './store.verifier';
import { buildStoreVerifier } from './store.verifier';
import { loadConfig } from '../config/config';

const res = (status: number, body: any = {}) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const err = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e: any) { return e.getResponse().error; } };

describe('Google Play verifier', () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cfg = { packageName: 'com.example.app', serviceAccountJson: JSON.stringify({ client_email: 'svc@example.iam.gserviceaccount.com', private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
  const build = (product: any, status = 200) => {
    const calls: Array<{ url: string; init?: any }> = [];
    const fetcher = jest.fn(async (url: string, init?: any) => {
      calls.push({ url, init });
      if (url.includes('oauth2.googleapis.com')) return res(200, { access_token: 'tok', expires_in: 3600 });
      if (url.endsWith(':consume')) return res(200);
      return res(status, product);
    });
    return { v: new GooglePlayVerifier(cfg, fetcher as any), calls };
  };

  it('accepts a paid purchase, signs the token request properly, and consumes the purchase', async () => {
    const { v, calls } = build({ purchaseState: 0, consumptionState: 0, orderId: 'GPA.1234' });
    expect(await v.verify({ platform: 'GOOGLE', productId: 'coins_500', token: 'purchase-token' })).toEqual({ transactionId: 'GPA.1234', productId: 'coins_500' });
    const assertion = /assertion=(.+)$/.exec(calls[0].init.body)![1].split('.');
    expect(createVerify('RSA-SHA256').update(`${assertion[0]}.${assertion[1]}`).verify(rsa.publicKey, Buffer.from(assertion[2], 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(assertion[1], 'base64url').toString())).toMatchObject({ iss: 'svc@example.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/androidpublisher' });
    expect(calls[1].url).toContain('/applications/com.example.app/purchases/products/coins_500/tokens/purchase-token');
    expect(calls[1].init.headers.authorization).toBe('Bearer tok');
    expect(calls[2].url.endsWith(':consume')).toBe(true);
  });

  it('rejects cancelled, pending, missing or unknown purchases', async () => {
    expect(await err(build({ purchaseState: 1, orderId: 'x' }).v.verify({ platform: 'GOOGLE', productId: 'p', token: 't' }))).toBe('INVALID_RECEIPT');
    expect(await err(build({ purchaseState: 2, orderId: 'x' }).v.verify({ platform: 'GOOGLE', productId: 'p', token: 't' }))).toBe('INVALID_RECEIPT');
    expect(await err(build({ purchaseState: 0 }).v.verify({ platform: 'GOOGLE', productId: 'p', token: 't' }))).toBe('INVALID_RECEIPT');
    expect(await err(build({}, 404).v.verify({ platform: 'GOOGLE', productId: 'p', token: 't' }))).toBe('INVALID_RECEIPT');
    expect(await err(build({}, 500).v.verify({ platform: 'GOOGLE', productId: 'p', token: 't' }))).toBe('STORE_UNREACHABLE');
  });

  it('does not consume a purchase that is already consumed', async () => {
    const { v, calls } = build({ purchaseState: 0, consumptionState: 1, orderId: 'GPA.9' });
    await v.verify({ platform: 'GOOGLE', productId: 'coins_500', token: 't' });
    expect(calls.some((c) => c.url.endsWith(':consume'))).toBe(false);
  });

  it('is unavailable without credentials', async () => {
    expect(await err(new GooglePlayVerifier(null).verify({ platform: 'GOOGLE', productId: 'p', token: 't' }))).toBe('STORE_NOT_CONFIGURED');
  });
});

describe('App Store verifier', () => {
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const cfg = { bundleId: 'com.example.app', issuerId: 'issuer-1', keyId: 'KEY123', privateKey: ec.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, sandbox: false };
  const jws = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
  const build = (payload: object | null, status = 200) => {
    const calls: Array<{ url: string; init?: any }> = [];
    const fetcher = jest.fn(async (url: string, init?: any) => { calls.push({ url, init }); return res(status, payload ? { signedTransactionInfo: jws(payload) } : {}); });
    return { v: new AppleStoreVerifier(cfg, fetcher as any), calls };
  };

  it('accepts a matching transaction and authenticates with an ES256 token', async () => {
    const { v, calls } = build({ bundleId: 'com.example.app', productId: 'coins_500', transactionId: 2000000123 });
    expect(await v.verify({ platform: 'APPLE', productId: 'coins_500', token: '2000000123' })).toEqual({ transactionId: '2000000123', productId: 'coins_500' });
    expect(calls[0].url).toBe('https://api.storekit.itunes.apple.com/inApps/v1/transactions/2000000123');
    const [h, b, s] = calls[0].init.headers.authorization.replace('Bearer ', '').split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
    expect(JSON.parse(Buffer.from(b, 'base64url').toString())).toMatchObject({ iss: 'issuer-1', aud: 'appstoreconnect-v1', bid: 'com.example.app' });
    expect(createVerify('SHA256').update(`${h}.${b}`).verify({ key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true);
  });

  it('uses the sandbox host when asked', async () => {
    const calls: string[] = [];
    const v = new AppleStoreVerifier({ ...cfg, sandbox: true }, (async (u: string) => { calls.push(u); return res(404); }) as any);
    await err(v.verify({ platform: 'APPLE', productId: 'p', token: '1' }));
    expect(calls[0]).toContain('api.storekit-sandbox.itunes.apple.com');
  });

  it('rejects other apps, other products, refunds, unknown transactions and outages', async () => {
    const ok = { bundleId: 'com.example.app', productId: 'coins_500', transactionId: 1 };
    const req = { platform: 'APPLE' as const, productId: 'coins_500', token: '1' };
    expect(await err(build({ ...ok, bundleId: 'com.other.app' }).v.verify(req))).toBe('INVALID_RECEIPT');
    expect(await err(build({ ...ok, productId: 'coins_16000' }).v.verify(req))).toBe('INVALID_RECEIPT');
    expect(await err(build({ ...ok, revocationDate: 1700000000000 }).v.verify(req))).toBe('INVALID_RECEIPT');
    expect(await err(build(null, 404).v.verify(req))).toBe('INVALID_RECEIPT');
    expect(await err(build(null, 503).v.verify(req))).toBe('STORE_UNREACHABLE');
  });

  it('is unavailable without credentials', async () => {
    expect(await err(new AppleStoreVerifier(null).verify({ platform: 'APPLE', productId: 'p', token: '1' }))).toBe('STORE_NOT_CONFIGURED');
  });
});

describe('store mode', () => {
  const base = { DATABASE_URL: 'postgresql://x@localhost/x' };
  it('accepts test receipts only in fake mode, and fake mode is refused in production', async () => {
    const fake = buildStoreVerifier(loadConfig({ ...base, STORE_MODE: 'fake' }));
    expect(await fake.verify({ platform: 'GOOGLE', productId: 'a', token: 'fake:t1:a' })).toEqual({ transactionId: 't1', productId: 'a' });
    expect(await err(new FakeStoreVerifier().verify({ platform: 'GOOGLE', productId: 'a', token: 'nope' }))).toBe('INVALID_RECEIPT');
    expect(() => loadConfig({ ...base, STORE_MODE: 'fake', NODE_ENV: 'production', JWT_ACCESS_SECRET: 'x'.repeat(40) })).toThrow(/not allowed in production/);
    expect(() => loadConfig({ ...base, STORE_MODE: 'maybe' })).toThrow();
    const live = buildStoreVerifier(loadConfig(base));
    return expect(err(live.verify({ platform: 'GOOGLE', productId: 'a', token: 'fake:t1:a' }))).resolves.toBe('STORE_NOT_CONFIGURED');
  });
});
