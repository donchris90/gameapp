import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError, api, login, logout, setLogoutHandler, signedIn } from './api';

type View = { page: 'dashboard' } | { page: 'users' } | { page: 'user'; id: string } | { page: 'matches' } | { page: 'reports' } | { page: 'purchases' } | { page: 'audit' };

const n = (v: number) => v.toLocaleString();
const when = (s: string) => new Date(s).toLocaleString();
const sign = (v: number) => <span className={v > 0 ? 'pos' : v < 0 ? 'neg' : 'dim'}>{v > 0 ? '+' : ''}{n(v)}</span>;
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong');

function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setError('');
    api<T>(path).then((d) => live && setData(d)).catch((e) => live && setError(msg(e)));
    return () => { live = false; };
  }, [path, tick, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload: () => setTick((t) => t + 1) };
}

export function App() {
  const [authed, setAuthed] = useState(signedIn());
  const [view, setView] = useState<View>({ page: 'dashboard' });
  useEffect(() => { setLogoutHandler(() => setAuthed(false)); }, []);
  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  const nav = (page: View['page'], label: string) => (
    <a className={view.page === page || (page === 'users' && view.page === 'user') ? 'on' : ''} onClick={() => setView({ page } as View)}>{label}</a>
  );
  return (
    <div className="layout">
      <nav className="side">
        <h1>🎮 PlayCircle</h1>
        {nav('dashboard', 'Dashboard')}{nav('users', 'Players')}{nav('matches', 'Games')}{nav('reports', 'Reports')}{nav('purchases', 'Purchases')}{nav('audit', 'Audit log')}
        <div style={{ flex: 1 }} />
        <a onClick={async () => { await logout(); setAuthed(false); }}>Log out</a>
      </nav>
      <main className="main">
        {view.page === 'dashboard' && <Dashboard />}
        {view.page === 'users' && <Users onOpen={(id) => setView({ page: 'user', id })} />}
        {view.page === 'user' && <UserPage id={view.id} onBack={() => setView({ page: 'users' })} />}
        {view.page === 'matches' && <Matches />}
        {view.page === 'reports' && <Reports onOpen={(id) => setView({ page: 'user', id })} />}
        {view.page === 'purchases' && <Purchases />}
        {view.page === 'audit' && <Audit />}
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(id.trim(), pw); onDone(); } catch (x) { setErr(msg(x)); } finally { setBusy(false); }
  };
  return (
    <form className="login card" onSubmit={submit}>
      <h2>PlayCircle admin</h2>
      <input placeholder="Email or username" value={id} onChange={(e) => setId(e.target.value)} autoFocus />
      <input placeholder="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
      {err ? <div className="err">{err}</div> : null}
      <button disabled={busy || !id || !pw}>Log in</button>
    </form>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="card stat"><span>{label}</span><b>{value}</b>{hint ? <span>{hint}</span> : null}</div>;
}

function Dashboard() {
  const { data: s, error, reload } = useLoad<any>('/admin/stats');
  useEffect(() => { const t = setInterval(reload, 30_000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <div className="err">{error}</div>;
  if (!s) return <p className="dim">Loading…</p>;
  return (
    <>
      <h2>Dashboard</h2>
      <h3>Players</h3>
      <div className="grid">
        <Stat label="Total players" value={n(s.users.total)} />
        <Stat label="New today" value={n(s.users.newToday)} />
        <Stat label="Played a game today" value={n(s.users.activePlayersToday)} />
        <Stat label="Suspended / banned" value={`${s.users.byStatus.SUSPENDED ?? 0} / ${s.users.byStatus.BANNED ?? 0}`} />
      </div>
      <h3>Games</h3>
      <div className="grid">
        <Stat label="Being played now" value={n(s.matches.activeNow)} />
        <Stat label="Started today" value={n(s.matches.today)} />
        <Stat label="All time" value={n(s.matches.allTime)} />
      </div>
      <h3>Coins</h3>
      <div className="grid">
        <Stat label="In players' wallets" value={n(s.coins.inCirculation)} />
        <Stat label="House fee today" value={n(s.coins.houseFeeToday)} hint={`${n(s.coins.houseFeeAllTime)} all time`} />
        <Stat label="Sold today" value={n(s.coins.soldToday)} hint={`${s.purchases.today} purchases · ${n(s.coins.soldAllTime)} coins all time`} />
        <Stat label="Given free today" value={n(s.coins.adRewardsToday + s.coins.dailyBonusToday)} hint={`ads ${n(s.coins.adRewardsToday)} · daily ${n(s.coins.dailyBonusToday)}`} />
      </div>
    </>
  );
}

function Pager({ cursor, onMore, more }: { cursor: string | null; onMore: () => void; more: boolean }) {
  return cursor ? <p><button className="ghost" disabled={more} onClick={onMore}>{more ? 'Loading…' : 'Load more'}</button></p> : null;
}

/** Cursor-paged list that keeps what it has already loaded. */
function usePaged<T>(base: string, key: string) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (from: string | null, replace: boolean) => {
    setBusy(true);
    try {
      const sep = base.includes('?') ? '&' : '?';
      const r = await api<any>(`${base}${from ? `${sep}cursor=${from}` : ''}`);
      setItems((cur) => (replace ? r[key] : [...cur, ...r[key]]));
      setCursor(r.nextCursor); setError('');
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }, [base, key]);
  useEffect(() => { void load(null, true); }, [load]);
  return { items, cursor, error, busy, more: () => load(cursor, false), reload: () => load(null, true) };
}

function Users({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const { items, cursor, error, busy, more } = usePaged<any>(`/admin/users?limit=25${applied ? `&q=${encodeURIComponent(applied)}` : ''}`, 'users');
  return (
    <>
      <h2>Players</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setApplied(q); }} style={{ marginBottom: 14 }}>
        <input style={{ maxWidth: 360 }} placeholder="Search username, email or friend code" value={q} onChange={(e) => setQ(e.target.value)} />
        <button>Search</button>
        {applied ? <button type="button" className="ghost" onClick={() => { setQ(''); setApplied(''); }}>Clear</button> : null}
      </form>
      {error ? <div className="err">{error}</div> : null}
      <table>
        <thead><tr><th>Player</th><th>Email</th><th>Coins</th><th>Status</th><th>Joined</th></tr></thead>
        <tbody>{items.map((u) => (
          <tr key={u.id} className="click" onClick={() => onOpen(u.id)}>
            <td>{u.username}{u.role === 'ADMIN' ? ' 🛡️' : ''}</td><td className="dim">{u.email}</td><td>{n(u.coins)}</td><td><span className={`pill ${u.status}`}>{u.status}</span></td><td className="dim">{when(u.createdAt)}</td>
          </tr>))}
          {items.length === 0 && !busy ? <tr><td colSpan={5} className="dim">No players found.</td></tr> : null}
        </tbody>
      </table>
      <Pager cursor={cursor} onMore={more} more={busy} />
    </>
  );
}

function UserPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: d, error, reload } = useLoad<any>(`/admin/users/${id}`);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [msgText, setMsgText] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setMsgText('');
    try { await fn(); setMsgText(done); reload(); } catch (e) { setMsgText(msg(e)); } finally { setBusy(false); }
  };
  if (error) return <><button className="ghost" onClick={onBack}>‹ Back</button><div className="err">{error}</div></>;
  if (!d) return <p className="dim">Loading…</p>;
  const u = d.user;
  const setStatus = (status: string) => run(() => api(`/admin/users/${id}/status`, 'POST', { status, reason: note }), `Status is now ${status}`).then(() => setNote(''));

  return (
    <>
      <p><button className="ghost" onClick={onBack}>‹ Back</button></p>
      <h2>{u.username} <span className={`pill ${u.status}`}>{u.status}</span></h2>
      <div className="two">
        <div className="card">
          <div>{u.email}</div>
          <div className="dim">Display name {u.displayName} · friend code {u.friendCode}</div>
          <div className="dim">Born {String(u.birthDate).slice(0, 10)} · joined {when(u.createdAt)}</div>
          <div style={{ fontSize: 28, margin: '10px 0' }}>🪙 {n(u.coins)}</div>
          <div className="dim">Ads watched: {d.adsWatched}</div>
        </div>
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <b>Adjust coins</b>
          <input placeholder="Amount (negative to take away)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input placeholder="Reason (kept in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button disabled={busy || !/^-?\d+$/.test(amount) || Number(amount) === 0 || reason.trim().length < 3}
            onClick={() => run(() => api(`/admin/users/${id}/adjust`, 'POST', { amount: Number(amount), reason: reason.trim() }), 'Coins updated').then(() => { setAmount(''); setReason(''); })}>Apply</button>
          {u.role !== 'ADMIN' ? (
            <>
              <b style={{ marginTop: 8 }}>Account</b>
              <input placeholder="Reason for the change" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="row">
                {u.status !== 'ACTIVE' ? <button className="good" disabled={busy || note.trim().length < 3} onClick={() => setStatus('ACTIVE')}>Reactivate</button> : null}
                {u.status !== 'SUSPENDED' ? <button className="ghost" disabled={busy || note.trim().length < 3} onClick={() => setStatus('SUSPENDED')}>Suspend</button> : null}
                {u.status !== 'BANNED' ? <button className="danger" disabled={busy || note.trim().length < 3} onClick={() => setStatus('BANNED')}>Ban</button> : null}
              </div>
            </>
          ) : <span className="dim">Admin account</span>}
          {msgText ? <div className={msgText.startsWith('Coins') || msgText.startsWith('Status') ? 'pos' : 'err'}>{msgText}</div> : null}
        </div>
      </div>

      <h3>Recent coin movements</h3>
      <table><thead><tr><th>When</th><th>Type</th><th>Amount</th><th>Balance after</th></tr></thead>
        <tbody>{d.ledger.map((e: any) => <tr key={e.id}><td className="dim">{when(e.createdAt)}</td><td>{e.type}</td><td>{sign(e.amount)}</td><td>{e.balanceAfter === null ? '' : n(e.balanceAfter)}</td></tr>)}</tbody></table>

      <h3>Recent games</h3>
      <table><thead><tr><th>When</th><th>Game</th><th>Result</th><th>Stake</th><th>Payout</th><th>Ended by</th></tr></thead>
        <tbody>{d.matches.map((m: any) => <tr key={m.matchId}><td className="dim">{when(m.createdAt)}</td><td>{m.game}</td><td>{m.result ? <span className={`pill ${m.result}`}>{m.result}</span> : m.status}</td><td>{n(m.stake)}</td><td>{n(m.payout)}</td><td className="dim">{m.endReason ?? ''}</td></tr>)}</tbody></table>

      <h3>Purchases</h3>
      <table><thead><tr><th>When</th><th>Store</th><th>Pack</th><th>Coins</th><th>Transaction</th></tr></thead>
        <tbody>{d.purchases.map((p: any) => <tr key={p.id}><td className="dim">{when(p.createdAt)}</td><td>{p.platform}</td><td>{p.productId}</td><td>{n(p.coins)}</td><td className="dim">{p.transactionId}</td></tr>)}
          {d.purchases.length === 0 ? <tr><td colSpan={5} className="dim">None</td></tr> : null}</tbody></table>

      <h3>Admin actions on this player</h3>
      <table><thead><tr><th>When</th><th>By</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>{d.audits.map((a: any) => <tr key={a.id}><td className="dim">{when(a.createdAt)}</td><td>{a.by}</td><td>{a.action}</td><td className="dim">{JSON.stringify(a.data)}</td></tr>)}
          {d.audits.length === 0 ? <tr><td colSpan={4} className="dim">None</td></tr> : null}</tbody></table>
    </>
  );
}

function Matches() {
  const [filter, setFilter] = useState('');
  const { items, cursor, error, busy, more, reload } = usePaged<any>(`/admin/matches?limit=25${filter ? `&status=${filter}` : ''}`, 'matches');
  return (
    <>
      <h2>Games</h2>
      <div className="row" style={{ marginBottom: 14 }}>
        <select style={{ maxWidth: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option><option value="ACTIVE">Being played</option><option value="FINISHED">Finished</option>
        </select>
        <button className="ghost" onClick={reload}>Refresh</button>
      </div>
      {error ? <div className="err">{error}</div> : null}
      <table>
        <thead><tr><th>Started</th><th>Game</th><th>Players</th><th>Stake</th><th>House fee</th><th>Status</th></tr></thead>
        <tbody>{items.map((m) => (
          <tr key={m.id}>
            <td className="dim">{when(m.createdAt)}</td><td>{m.game}</td>
            <td>{m.players.map((p: any) => <span key={p.userId} style={{ marginRight: 10 }}>{p.username}{p.computer ? ' 🤖' : ''}{p.result ? <> <span className={`pill ${p.result}`}>{p.result}</span></> : null}</span>)}</td>
            <td>{n(m.stake)}</td><td>{n(m.houseFee)}</td><td>{m.status === 'ACTIVE' ? 'Playing' : m.endReason}</td>
          </tr>))}</tbody>
      </table>
      <Pager cursor={cursor} onMore={more} more={busy} />
    </>
  );
}

function Reports({ onOpen }: { onOpen: (id: string) => void }) {
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const { data, error, reload } = useLoad<{ reports: any[] }>(`/admin/reports?status=${status}&limit=100`);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const resolve = async (id: string) => {
    setErr('');
    try { await api(`/admin/reports/${id}/resolve`, 'POST', { note: notes[id] ?? 'handled' }); reload(); } catch (e) { setErr(msg(e)); }
  };
  return (
    <>
      <h2>Chat reports</h2>
      <div className="row" style={{ marginBottom: 14 }}>
        <select style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value as 'OPEN' | 'RESOLVED')}><option value="OPEN">Open</option><option value="RESOLVED">Closed</option></select>
        <button className="ghost" onClick={reload}>Refresh</button>
      </div>
      {error || err ? <div className="err">{error || err}</div> : null}
      {data && data.reports.length === 0 ? <p className="dim">Nothing here.</p> : null}
      {data?.reports.map((r) => (
        <div key={r.id} className="card" style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div><b>{r.reporter.username}</b> reported <a onClick={() => onOpen(r.reported.id)}><b>{r.reported.username}</b></a> <span className={`pill ${r.reported.status}`}>{r.reported.status}</span></div>
            <span className="dim">{when(r.createdAt)}</span>
          </div>
          <p style={{ margin: '8px 0' }}>Reason: {r.reason}</p>
          <blockquote style={{ margin: '8px 0', padding: '8px 12px', borderLeft: '3px solid #c0392b' }}>{r.messageText}</blockquote>
          <details><summary className="dim">Conversation around it</summary>
            {(r.context as any[]).map((c, i) => <div key={i} className="dim" style={{ padding: '2px 0' }}>{c.from === r.reported.id ? r.reported.username : r.reporter.username}: {c.body}</div>)}
          </details>
          {status === 'OPEN' ? (
            <div className="row" style={{ marginTop: 10 }}>
              <input placeholder="What you did (warned, banned…)" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
              <button disabled={(notes[r.id] ?? '').trim().length < 3} onClick={() => resolve(r.id)}>Close report</button>
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}

function Purchases() {
  const { items, cursor, error, busy, more } = usePaged<any>('/admin/purchases?limit=25', 'purchases');
  return (
    <>
      <h2>Purchases</h2>
      {error ? <div className="err">{error}</div> : null}
      <table>
        <thead><tr><th>When</th><th>Player</th><th>Store</th><th>Pack</th><th>Coins</th><th>Transaction</th></tr></thead>
        <tbody>{items.map((p) => <tr key={p.id}><td className="dim">{when(p.createdAt)}</td><td>{p.username}</td><td>{p.platform}</td><td>{p.productId}</td><td>{n(p.coins)}</td><td className="dim">{p.transactionId}</td></tr>)}
          {items.length === 0 && !busy ? <tr><td colSpan={6} className="dim">No purchases yet.</td></tr> : null}</tbody>
      </table>
      <Pager cursor={cursor} onMore={more} more={busy} />
    </>
  );
}

function Audit() {
  const { items, cursor, error, busy, more } = usePaged<any>('/admin/audit?limit=25', 'entries');
  return (
    <>
      <h2>Audit log</h2>
      <p className="dim">Every admin action on a player. It cannot be edited.</p>
      {error ? <div className="err">{error}</div> : null}
      <table>
        <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Player</th><th>Details</th></tr></thead>
        <tbody>{items.map((a) => <tr key={a.id}><td className="dim">{when(a.createdAt)}</td><td>{a.admin}</td><td>{a.action}</td><td>{a.target ?? ''}</td><td className="dim">{JSON.stringify(a.data)}</td></tr>)}
          {items.length === 0 && !busy ? <tr><td colSpan={5} className="dim">Nothing yet.</td></tr> : null}</tbody>
      </table>
      <Pager cursor={cursor} onMore={more} more={busy} />
    </>
  );
}
