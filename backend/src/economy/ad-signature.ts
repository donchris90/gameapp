import { createPublicKey, verify } from 'crypto';

export const AD_KEYS = Symbol('AD_KEYS');
/** AdMob's public verifier keys, by key id (base64 DER public keys). */
export interface AdKeyProvider { get(keyId: string): Promise<string | null>; }

const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

export class GoogleAdKeys implements AdKeyProvider {
  private keys = new Map<string, string>();
  private fetchedAt = 0;
  constructor(private readonly fetcher: (url: string) => Promise<{ ok: boolean; json(): Promise<any> }> = fetch as any) {}
  async get(keyId: string) {
    if (!this.keys.has(keyId) && Date.now() - this.fetchedAt > 60_000) {
      this.fetchedAt = Date.now();
      const res = await this.fetcher(KEYS_URL);
      if (res.ok) for (const k of (await res.json()).keys ?? []) this.keys.set(String(k.keyId), k.base64);
    }
    return this.keys.get(keyId) ?? null;
  }
}

/**
 * AdMob signs the callback's query string (everything before `&signature=`) with ECDSA/SHA-256.
 * `rawQuery` must be the query string exactly as received, without the leading "?".
 */
export async function verifyAdCallback(rawQuery: string, keys: AdKeyProvider): Promise<boolean> {
  const at = rawQuery.indexOf('&signature=');
  if (at < 0) return false;
  const signed = rawQuery.slice(0, at);
  const rest = new URLSearchParams(rawQuery.slice(at + 1));
  const signature = rest.get('signature'), keyId = rest.get('key_id');
  if (!signature || !keyId) return false;
  const key = await keys.get(keyId);
  if (!key) return false;
  try {
    return verify('sha256', Buffer.from(signed), createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' }), Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}
