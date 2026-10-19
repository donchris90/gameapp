import { createSign, createPrivateKey } from 'crypto';
import { appError } from '../common/errors';
import { AppConfig } from '../config/config';

export type Platform = 'GOOGLE' | 'APPLE';
export interface StoreReceipt { platform: Platform; productId: string; token: string; }
export interface VerifiedPurchase { transactionId: string; productId: string; }

/** Asks the store whether a receipt is genuine, paid, and for which product. */
export interface StoreVerifier {
  verify(r: StoreReceipt): Promise<VerifiedPurchase>;
}
export const STORE_VERIFIER = Symbol('STORE_VERIFIER');

type Fetch = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>;
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const invalid = (msg = 'The store did not confirm this purchase') => appError(400, 'INVALID_RECEIPT', msg);
const unavailable = (what: string) => appError(503, 'STORE_NOT_CONFIGURED', `${what} purchases are not set up on the server yet`);

/** Test and development only. Token format: `fake:<transactionId>:<productId>`. Refused in production by config. */
export class FakeStoreVerifier implements StoreVerifier {
  async verify(r: StoreReceipt): Promise<VerifiedPurchase> {
    const [kind, transactionId, productId] = r.token.split(':');
    if (kind !== 'fake' || !transactionId || !productId) throw invalid();
    return { transactionId, productId };
  }
}

/** Google Play: purchases.products.get with a service account, then consume so it can be bought again. */
export class GooglePlayVerifier implements StoreVerifier {
  private cached: { token: string; exp: number } | null = null;
  constructor(private readonly cfg: AppConfig['googlePlay'], private readonly fetcher: Fetch = fetch as any, private readonly now = () => Date.now()) {}

  private async accessToken(): Promise<string> {
    if (this.cached && this.cached.exp > this.now() + 60_000) return this.cached.token;
    const sa = JSON.parse(this.cfg!.serviceAccountJson);
    const iat = Math.floor(this.now() / 1000);
    const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = b64u(JSON.stringify({
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
    }));
    const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(createPrivateKey(sa.private_key)).toString('base64url');
    const res = await this.fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${body}.${sig}`,
    });
    if (!res.ok) throw appError(502, 'STORE_UNREACHABLE', 'Could not reach Google Play');
    const j = await res.json();
    this.cached = { token: j.access_token, exp: this.now() + (j.expires_in ?? 3000) * 1000 };
    return this.cached.token;
  }

  async verify(r: StoreReceipt): Promise<VerifiedPurchase> {
    if (!this.cfg) throw unavailable('Google Play');
    const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(this.cfg.packageName)}/purchases/products/${encodeURIComponent(r.productId)}/tokens/${encodeURIComponent(r.token)}`;
    const auth = { authorization: `Bearer ${await this.accessToken()}` };
    const res = await this.fetcher(base, { headers: auth });
    if (res.status === 404 || res.status === 400) throw invalid();
    if (!res.ok) throw appError(502, 'STORE_UNREACHABLE', 'Could not reach Google Play');
    const p = await res.json();
    if (p.purchaseState !== 0) throw invalid('This purchase was cancelled or is still pending');
    if (!p.orderId) throw invalid();
    // Consuming lets the player buy the same pack again; a repeat call on a consumed token is harmless for us.
    if (p.consumptionState !== 1) await this.fetcher(`${base}:consume`, { method: 'POST', headers: auth }).catch(() => undefined);
    return { transactionId: p.orderId, productId: r.productId };
  }
}

/** App Store: ask Apple's App Store Server API for the transaction directly (TLS authenticates the answer). */
export class AppleStoreVerifier implements StoreVerifier {
  constructor(private readonly cfg: AppConfig['appleStore'], private readonly fetcher: Fetch = fetch as any, private readonly now = () => Date.now()) {}

  private jwt(): string {
    const c = this.cfg!;
    const iat = Math.floor(this.now() / 1000);
    const head = b64u(JSON.stringify({ alg: 'ES256', kid: c.keyId, typ: 'JWT' }));
    const body = b64u(JSON.stringify({ iss: c.issuerId, iat, exp: iat + 1200, aud: 'appstoreconnect-v1', bid: c.bundleId }));
    const sig = createSign('SHA256').update(`${head}.${body}`).sign({ key: c.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return `${head}.${body}.${sig}`;
  }

  async verify(r: StoreReceipt): Promise<VerifiedPurchase> {
    if (!this.cfg) throw unavailable('App Store');
    const host = this.cfg.sandbox ? 'api.storekit-sandbox.itunes.apple.com' : 'api.storekit.itunes.apple.com';
    const res = await this.fetcher(`https://${host}/inApps/v1/transactions/${encodeURIComponent(r.token)}`, { headers: { authorization: `Bearer ${this.jwt()}` } });
    if (res.status === 404 || res.status === 400) throw invalid();
    if (!res.ok) throw appError(502, 'STORE_UNREACHABLE', 'Could not reach the App Store');
    const { signedTransactionInfo } = await res.json();
    const payload = JSON.parse(Buffer.from(String(signedTransactionInfo).split('.')[1] ?? '', 'base64url').toString('utf8'));
    if (payload.bundleId !== this.cfg.bundleId || payload.productId !== r.productId) throw invalid();
    if (payload.revocationDate) throw invalid('This purchase was refunded');
    return { transactionId: String(payload.transactionId), productId: payload.productId };
  }
}

/** Picks the verifier for each platform. In live mode a platform without credentials answers 503, never "ok". */
export class RoutingStoreVerifier implements StoreVerifier {
  constructor(private readonly byPlatform: Record<Platform, StoreVerifier>) {}
  verify(r: StoreReceipt) { return this.byPlatform[r.platform].verify(r); }
}

export function buildStoreVerifier(cfg: AppConfig): StoreVerifier {
  if (cfg.storeMode === 'fake') {
    const fake = new FakeStoreVerifier();
    return new RoutingStoreVerifier({ GOOGLE: fake, APPLE: fake });
  }
  return new RoutingStoreVerifier({ GOOGLE: new GooglePlayVerifier(cfg.googlePlay), APPLE: new AppleStoreVerifier(cfg.appleStore) });
}
