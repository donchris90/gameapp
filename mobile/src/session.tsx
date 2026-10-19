import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ApiError, api, getAccessToken, loadTokens, refreshSession, saveTokens, setSignedOutHandler } from './api';
import { API_URL } from './config';
import { Me, Tokens } from './types';

interface Session {
  ready: boolean;
  user: Me | null;
  coins: number;
  socket: Socket | null;
  refreshCoins: () => Promise<void>;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (f: { email: string; username: string; password: string; birthDate: string }) => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<Session>(null as unknown as Session);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<Me | null>(null);
  const [coins, setCoins] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);

  const refreshCoins = useCallback(async () => {
    try { setCoins((await api<{ coins: number }>('/wallet')).coins); } catch { /* shown on next refresh */ }
  }, []);

  const dropSession = useCallback(() => { setUser(null); setCoins(0); }, []);
  useEffect(() => { setSignedOutHandler(dropSession); }, [dropSession]);

  // Restore a saved login on start.
  useEffect(() => {
    (async () => {
      if (await loadTokens()) {
        try { setUser(await api<Me>('/users/me')); } catch (e) {
          if (!(e instanceof ApiError) || e.status === 0) { /* offline: stay signed out for now, tokens are kept */ }
        }
      }
      setReady(true);
    })();
  }, []);

  // One live connection while signed in.
  const userId = user?.id;
  const sockRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!userId) { sockRef.current?.disconnect(); sockRef.current = null; setSocket(null); return; }
    const s = io(API_URL, { transports: ['websocket'], auth: (cb) => cb({ token: getAccessToken() }), reconnectionDelayMax: 5000 });
    s.on('unauthorized', async () => { if (await refreshSession()) s.connect(); });
    s.on('connect', () => void refreshCoins());
    sockRef.current = s; setSocket(s);
    void refreshCoins();
    return () => { s.disconnect(); };
  }, [userId, refreshCoins]);

  const finish = useCallback(async (user: Me, tokens: Tokens) => { await saveTokens(tokens); setUser(user); }, []);

  const value = useMemo<Session>(() => ({
    ready, user, coins, socket, refreshCoins,
    signIn: async (identifier, password) => {
      const r = await api<{ user: Me; tokens: Tokens }>('/auth/login', { method: 'POST', body: { identifier, password }, auth: false });
      await finish(r.user, r.tokens);
    },
    signUp: async (f) => {
      const r = await api<{ user: Me; tokens: Tokens }>('/auth/register', { method: 'POST', body: { ...f, confirmAdult: true, acceptTerms: true }, auth: false });
      await finish(r.user, r.tokens);
    },
    signOut: async () => {
      try { const t = await loadTokens(); if (t) await api('/auth/logout', { method: 'POST', body: { refreshToken: t.refreshToken }, auth: false }); } catch { /* ignore */ }
      await saveTokens(null); dropSession();
    },
  }), [ready, user, coins, socket, refreshCoins, finish, dropSession]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Runs `handler` whenever the server pushes `event`. */
export function useSocketEvent<T = any>(event: string, handler: (payload: T) => void) {
  const { socket } = useSession();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (p: T) => ref.current(p);
    socket.on(event, fn);
    return () => { socket.off(event, fn); };
  }, [socket, event]);
}
