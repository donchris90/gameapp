import { api, ApiError } from '../api';

/** One coin movement waiting to reach the shared wallet. The key makes a retry safe. */
export interface CoinOp { key: string; kind: 'earn' | 'spend'; amount: number }

export const EARN_CHUNK = 5000;
export const LEGACY_KEY = 'legacy-import';
export const LEGACY_MAX = 50000;

let counter = 0;
const newKey = (kind: string) => `${kind}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Turns a change in the coin count into wallet movements (big wins are split to fit the server limit). */
export function opsForDelta(delta: number): CoinOp[] {
  if (!Number.isFinite(delta) || delta === 0) return [];
  const n = Math.floor(Math.abs(delta));
  if (n === 0) return [];
  if (delta < 0) return [{ key: newKey('spend'), kind: 'spend', amount: n }];
  const out: CoinOp[] = [];
  for (let left = n; left > 0; left -= EARN_CHUNK) out.push({ key: newKey('earn'), kind: 'earn', amount: Math.min(left, EARN_CHUNK) });
  return out;
}

/** The older local balance, moved into the wallet once. */
export function legacyOp(localCoins: number): CoinOp | null {
  const n = Math.min(Math.floor(localCoins), LEGACY_MAX);
  return n > 0 ? { key: LEGACY_KEY, kind: 'earn', amount: n } : null;
}

/** What to show: the wallet balance with movements that have not reached the server yet applied on top. */
export function displayCoins(server: number, pending: CoinOp[]): number {
  return Math.max(0, pending.reduce((c, o) => c + (o.kind === 'earn' ? o.amount : -o.amount), server));
}

export interface FlushResult { done: string[]; coins: number | null }

/**
 * Sends the queue in order. Stops at the first problem that might clear up (offline, server error,
 * signed out) and keeps those movements. A movement the server refuses outright is dropped.
 */
export async function flushOps(ops: CoinOp[]): Promise<FlushResult> {
  const done: string[] = [];
  let coins: number | null = null;
  for (const op of ops) {
    try {
      const r = await api<{ coins: number }>(op.kind === 'earn' ? '/wallet/apex/earn' : '/wallet/apex/spend', {
        method: 'POST', body: op.kind === 'earn' ? { amount: op.amount, key: op.key } : { amount: op.amount, key: op.key, item: 'apex' },
      });
      coins = r.coins; done.push(op.key);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 402)) { done.push(op.key); continue; }
      break;
    }
  }
  if (coins === null && done.length === ops.length) {
    try { coins = (await api<{ coins: number }>('/wallet')).coins; } catch { /* keep what is shown */ }
  }
  return { done, coins };
}
