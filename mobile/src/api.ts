import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';
import { Tokens } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body?: any) {
    super(message);
  }
}

const KEY = 'playcircle.tokens';
let tokens: Tokens | null = null;
let onSignedOut: () => void = () => undefined;
let refreshing: Promise<boolean> | null = null;

export const getAccessToken = () => tokens?.accessToken ?? null;
export const setSignedOutHandler = (fn: () => void) => { onSignedOut = fn; };

export async function loadTokens(): Promise<Tokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    tokens = raw ? (JSON.parse(raw) as Tokens) : null;
  } catch { tokens = null; }
  return tokens;
}
export async function saveTokens(t: Tokens | null) {
  tokens = t;
  try { t ? await SecureStore.setItemAsync(KEY, JSON.stringify(t)) : await SecureStore.deleteItemAsync(KEY); } catch { /* keep in memory */ }
}

async function raw(path: string, init: { method?: string; body?: unknown; auth?: boolean }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.auth !== false && tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { res, data };
}

/** Swaps the refresh token for a new pair. Only one refresh runs at a time. */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      if (!tokens) return false;
      const { res, data } = await raw('/auth/refresh', { method: 'POST', body: { refreshToken: tokens.refreshToken }, auth: false }).catch(() => ({ res: null, data: null }));
      if (res?.ok && data?.tokens) { await saveTokens(data.tokens); return true; }
      if (res && (res.status === 401 || res.status === 403)) { await saveTokens(null); onSignedOut(); }
      return false;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  let { res, data } = await raw(path, init);
  if (res.status === 401 && init.auth !== false && tokens && (await refreshSession())) ({ res, data } = await raw(path, init));
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, data?.error ?? 'ERROR', message, data);
  }
  return data as T;
}

/** Friendly text for the errors players are most likely to hit. */
export function explain(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'INSUFFICIENT_COINS': return 'You do not have enough coins for that stake.';
      case 'ALREADY_IN_ROOM': return 'Leave your current room first.';
      case 'ALREADY_QUEUED': return 'You are already searching for a match.';
      case 'ROOM_NOT_FOUND': return 'No room with that code.';
      case 'ROOM_FULL': return 'That room is full.';
      case 'ALREADY_CLAIMED': return 'You already took today\'s bonus.';
      case 'AD_LIMIT_REACHED': return 'No more reward ads today. Come back tomorrow.';
      case 'NOT_YOUR_TURN': return 'Wait for your turn.';
      case 'STALE_STATE': return 'The game moved on. Try again.';
    }
    return e.message;
  }
  return 'Something went wrong. Try again.';
}
