const BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const KEY = 'playcircle.admin.tokens';

interface Tokens { accessToken: string; refreshToken: string }
let tokens: Tokens | null = (() => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); } catch { return null; } })();
let onLogout: () => void = () => undefined;
export const setLogoutHandler = (fn: () => void) => { onLogout = fn; };
export const signedIn = () => tokens !== null;

function save(t: Tokens | null) {
  tokens = t;
  if (t) sessionStorage.setItem(KEY, JSON.stringify(t)); else sessionStorage.removeItem(KEY);
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function raw(path: string, method: string, body?: unknown, auth = true) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth && tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  let res: Response;
  try { res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ApiError(0, 'NETWORK', 'Cannot reach the server'); }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { res, data };
}

async function refresh(): Promise<boolean> {
  if (!tokens) return false;
  const { res, data } = await raw('/auth/refresh', 'POST', { refreshToken: tokens.refreshToken }, false).catch(() => ({ res: null, data: null }));
  if (res?.ok && data?.tokens) { save(data.tokens); return true; }
  save(null); onLogout();
  return false;
}

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let { res, data } = await raw(path, method, body);
  if (res.status === 401 && tokens && (await refresh())) ({ res, data } = await raw(path, method, body));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'ERROR', Array.isArray(data?.message) ? data.message[0] : data?.message ?? `Request failed (${res.status})`);
  return data as T;
}

/** Logs in and makes sure the account really is an admin before keeping the session. */
export async function login(identifier: string, password: string) {
  const { res, data } = await raw('/auth/login', 'POST', { identifier, password }, false);
  if (!res.ok) throw new ApiError(res.status, 'LOGIN', data?.message ?? 'Wrong email/username or password');
  if (data.user.role !== 'ADMIN') throw new ApiError(403, 'NOT_ADMIN', 'This account is not an admin');
  save(data.tokens);
}

export async function logout() {
  const t = tokens;
  save(null);
  if (t) await raw('/auth/logout', 'POST', { refreshToken: t.refreshToken }, false).catch(() => undefined);
}
