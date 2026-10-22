import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { api, explain } from '../../src/api';
import { adDue, preloadInterstitial, showInterstitial } from '../../src/ads';
import { Ayo } from '../../src/games/Ayo';
import { Ludo } from '../../src/games/Ludo';
import { Whot, WhotTable } from '../../src/games/Whot';
import { TicTacToe } from '../../src/games/TicTacToe';
import { WaterSort } from '../../src/games/WaterSort';
import { ApexRace, isRacing } from '../../src/games/ApexRace';
import { GAME_INFO } from '../../src/games';
import { useSession, useSocketEvent } from '../../src/session';
import { Match } from '../../src/types';
import { useCountdown } from '../../src/useCountdown';
import { titleText } from '../../src/cosmetics';
import { onSoundChange, setSoundOn, sfx, soundOn } from '../../src/sfx';
import { EmoteControls } from '../../src/Emotes';
import { Chip, CoinSummary, Outcome, ResultModal, Standing } from '../../src/ResultModal';
import { fmtTime } from '../../src/games/ApexRace';
import { VoiceButton } from '../../src/Voice';
import { Body, Button, Coins, Dim, Screen, colors } from '../../src/ui';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, coins, refreshCoins } = useSession();
  const [match, setMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const latest = useRef(0);
  const [gameH, setGameH] = useState(0);
  const [sound, setSound] = useState(soundOn());
  const [rematchBusy, setRematchBusy] = useState(false);
  const [theyWant, setTheyWant] = useState<string | null>(null);
  useEffect(() => onSoundChange(setSound), []);

  const adShown = useRef(false);
  useEffect(() => { preloadInterstitial(); }, []);
  const lastSeen = useRef<{ status: string; turnSeat: number | null } | null>(null);
  const accept = useCallback((m: Match) => {
    if (m.id !== id || m.version < latest.current) return;
    latest.current = m.version;
    if (user) {
      const seat = m.players.find((p) => p.userId === user.id)?.seat;
      const prev = lastSeen.current;
      if (m.status === 'FINISHED' && prev?.status !== 'FINISHED') {
        const r = m.players.find((p) => p.userId === user.id)?.result;
        sfx(r === 'WON' ? 'win' : r === 'LOST' ? 'lose' : 'draw');
        // A finished game is followed by a full-screen ad as often as the admin has set for that game. Coins were already paid by the server, so this never delays a payout.
        if (prev && !adShown.current) { adShown.current = true; void adDue(m.game === 'APEX' ? 'APEX_RUN' : m.game).then((due) => { if (due) setTimeout(() => { void showInterstitial(); }, 2200); }); }
      } else if (prev && m.status === 'ACTIVE') {
        sfx(m.turnSeat === seat && prev.turnSeat !== seat ? 'turn' : 'move');
      }
    }
    lastSeen.current = { status: m.status, turnSeat: m.turnSeat };
    setMatch(m);
    if (m.status === 'FINISHED') void refreshCoins();
  }, [id, refreshCoins, user]);

  useEffect(() => { api<Match>(`/matches/${id}`).then(accept).catch(() => setMissing(true)); }, [id, accept]);
  useSocketEvent<Match>('match:state', accept);
  useSocketEvent<Match>('match:ended', accept);

  useSocketEvent<{ matchId: string; from: { displayName: string } }>('match:rematch', (e) => { if (e.matchId === id) setTheyWant(e.from.displayName); });

  const seconds = useCountdown(match?.status === 'ACTIVE' ? match.turnDeadline : null);

  if (missing) return <Screen><View style={{ flex: 1, justifyContent: 'center', gap: 12 }}><Body>This game could not be found.</Body><Button title="Home" onPress={() => router.replace('/(tabs)')} /></View></Screen>;
  if (!match || !user) return <Screen><View style={{ flex: 1 }} /></Screen>;

  const info = GAME_INFO[match.game];
  const mine = match.players.find((p) => p.userId === user.id);
  const mySeat = mine?.seat ?? -1;
  const over = match.status === 'FINISHED';
  const myTurn = match.turnSeat === mySeat;

  const send = async (move: object) => {
    if (busy) return;
    setBusy(true);
    try { accept(await api<Match>(`/matches/${match.id}/move`, { method: 'POST', body: { version: match.version, move } })); }
    catch (e) { Alert.alert('Move', explain(e)); const fresh = await api<Match>(`/matches/${match.id}`).catch(() => null); if (fresh) accept(fresh); }
    finally { setBusy(false); }
  };
  const resign = () => Alert.alert(match.players.length === 1 ? 'Give up?' : 'Resign?', match.stake > 0 ? 'You will lose your stake.' : 'This ends the game.', [
    { text: 'Keep playing', style: 'cancel' },
    { text: match.players.length === 1 ? 'Give up' : 'Resign', style: 'destructive', onPress: () => api<Match>(`/matches/${match.id}/forfeit`, { method: 'POST' }).then(accept).catch((e) => Alert.alert('Resign', explain(e))) },
  ]);
  const playAgain = async () => {
    setBusy(true);
    try { const m = await api<Match>('/matches/solo', { method: 'POST', body: { game: match.game, ...(match.game === 'WATER_SORT' && mine?.result !== 'WON' ? { level: match.state.level } : {}) } }); router.replace(`/match/${m.id}`); }
    catch (e) { Alert.alert('New puzzle', explain(e)); } finally { setBusy(false); }
  };
  const rematch = async () => {
    setRematchBusy(true);
    try { await api(`/social/rematch/${match.id}`, { method: 'POST' }); router.replace('/room'); }
    catch (e: any) {
      if (e?.code === 'VS_COMPUTER') router.replace(`/play/${match.game}`); // against the computer a rematch is a new search
      else Alert.alert('Rematch', explain(e));
    } finally { setRematchBusy(false); }
  };
  const goBack = async () => {
    const room = await api('/rooms/current').catch(() => null);
    router.replace(room ? '/room' : '/(tabs)');
  };

  const solo = match.players.length === 1; // a puzzle played alone (Water Sort)
  const resultText = !over ? '' : solo ? (mine?.result === 'WON' ? `Level ${match.state.level ?? ''} solved! 🎉` : match.endReason === 'FORFEIT' ? 'You gave up' : "Time's up") : mine?.result === 'WON' ? 'You won! 🎉' : mine?.result === 'DRAW' ? 'Draw' : 'You lost';
  const status = over ? resultText : solo ? '' : myTurn ? (match.game === 'LUDO' && match.state.phase === 'ROLL' ? 'Your turn: roll' : 'Your turn') : '';
  const bg = ({ TICTACTOE: '#0B1020', AYO: '#1C1009', LUDO: '#120F2B', WATER_SORT: '#111111', APEX: '#0A0D16', WHOT: '#0F2A1E' } as Record<string, string>)[match.game];
  const onAuto = !over && !!match.autoPlay?.includes(user.id);
  const takeBack = () => api<Match>(`/matches/${match.id}/resume`, { method: 'POST' }).then(accept).catch((e) => Alert.alert('Take back control', explain(e)));
  const quitToHome = () => api<Match>(`/matches/${match.id}/forfeit`, { method: 'POST' }).then((m) => { accept(m); goBack(); }).catch(() => goBack());
  const props = { match, mySeat, onMove: send, busy, height: gameH };
  // Whot is played on a full-screen landscape table; the result uses the normal layout.
  if (match.game === 'WHOT' && !over) return <WhotTable match={match} mySeat={mySeat} onMove={send} busy={busy} onResign={resign} />;
  // An Apex race gets the whole screen while you are driving; results use the normal layout.
  if (match.game === 'APEX' && isRacing(match, mySeat)) return <ApexRace full match={match} mySeat={mySeat} onMove={async (m) => { await send(m); }} onQuit={quitToHome} />;

  return (
    <Screen style={{ backgroundColor: bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40 }}>
        <Body style={{ fontWeight: '800', fontSize: 15 }}>{info.emoji} {info.title}</Body>
        <Text numberOfLines={1} style={{ flex: 1, color: over ? (mine?.result === 'WON' ? colors.good : colors.text) : colors.accent, fontWeight: '900', fontSize: 13 }}>{status}</Text>
        {seconds !== null ? <Text style={{ color: !solo && seconds <= 8 ? colors.bad : colors.dim, fontWeight: '800', fontSize: 13 }}>{solo ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : `${seconds}s`}</Text> : null}
        {match.pot > 0 ? <Coins amount={match.pot} /> : <Dim>{solo ? 'Solo' : 'Friendly'}</Dim>}
        {solo ? null : <VoiceButton />}
        {solo ? null : <EmoteControls matchId={match.id} />}
        <Pressable onPress={() => void setSoundOn(!sound)} hitSlop={10}><Text style={{ fontSize: 18 }}>{sound ? '🔊' : '🔇'}</Text></Pressable>
      </View>

      {onAuto ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, marginBottom: 6, borderRadius: 14, backgroundColor: 'rgba(124,92,255,.18)', borderWidth: 1, borderColor: colors.accent }}>
          <Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }}>🤖 You were away, so the computer is playing your turns.</Text>
          <Pressable onPress={takeBack} style={{ backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>Take back control</Text></Pressable>
        </View>
      ) : null}

      <View style={{ flex: 1 }} onLayout={(e) => setGameH(Math.floor(e.nativeEvent.layout.height))}>
        {gameH > 0 ? (
          match.game === 'TICTACTOE' ? <TicTacToe {...props} />
            : match.game === 'AYO' ? <Ayo {...props} />
            : match.game === 'LUDO' ? <Ludo {...props} />
            : match.game === 'WHOT' ? <Whot {...props} />
            : match.game === 'APEX' ? <ApexRace match={match} mySeat={mySeat} onMove={async (m) => { await send(m); }} onQuit={quitToHome} />
            : <WaterSort {...props} onQuit={quitToHome} />
        ) : null}
      </View>

      {!over ? (
        solo ? null : <Pressable onPress={resign} style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 22, marginVertical: 6 }}><Text style={{ color: colors.dim, fontWeight: '800' }}>Resign</Text></Pressable>
      ) : null}

      {over ? (
        <ResultModal
          {...resultModal(match, mine, solo, theyWant, coins)}
          banner={theyWant ? `${theyWant} wants a rematch` : null}
          primary={solo ? { title: mine?.result === 'WON' ? 'Next level' : 'Try again', onPress: playAgain, busy } : { title: theyWant ? 'Accept rematch' : match.game === 'APEX' ? 'Race again' : 'Rematch', onPress: rematch, busy: rematchBusy }}
          secondary={{ title: solo ? 'Home' : 'Back to lobby', onPress: goBack }}
        />
      ) : null}
    </Screen>
  );
}

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

/** Everything the result card shows, worked out from the finished match. */
function resultModal(match: Match, mine: Match['players'][number] | undefined, solo: boolean, _theyWant: string | null, coins: number) {
  const info = GAME_INFO[match.game];
  const n = match.players.length;
  const won = mine?.result === 'WON';
  const draw = mine?.result === 'DRAW';
  const apex = match.game === 'APEX';
  const ticks: Array<number | null> = apex ? (match.state?.ticks ?? []) : [];
  const ranked = apex
    ? [...match.players].sort((a, b) => { const x = ticks[a.seat] ?? null; const y = ticks[b.seat] ?? null; return x !== null && y !== null ? x - y : x !== null ? -1 : y !== null ? 1 : a.seat - b.seat; })
    : [...match.players].sort((a, b) => (a.result === 'WON' ? -1 : 0) - (b.result === 'WON' ? -1 : 0) || a.seat - b.seat);
  const myRank = Math.max(0, ranked.findIndex((p) => p.userId === mine?.userId));
  const myTicks = mine ? ticks[mine.seat] ?? null : null;

  let outcome: Outcome = won ? 'WON' : draw ? 'DRAW' : 'LOST';
  let title = won ? 'VICTORY' : draw ? 'DRAW' : 'DEFEAT';
  if (solo) {
    outcome = won ? 'SOLVED' : 'FAILED';
    title = won ? `LEVEL ${match.state?.level ?? ''} SOLVED`.replace('  ', ' ') : match.endReason === 'FORFEIT' ? 'GAVE UP' : "TIME'S UP";
  } else if (apex && !won) {
    if (myTicks !== null) { outcome = 'PLACE'; title = `${ORD[myRank]?.toUpperCase() ?? `${myRank + 1}TH`} PLACE`; }
    else title = 'NO TIME';
  }

  const bits = [info.title];
  if (apex) bits.push(`${match.state?.laps ?? 2} laps`);
  else if (solo) bits.push('solo');
  else bits.push(`${n} players`);
  if (!solo && !apex && match.endReason === 'FORFEIT') bits.push('resigned');
  if (!solo && !apex && match.endReason === 'TIMEOUT') bits.push('out of time');
  const subtitle = bits.join(' · ');

  let coin: CoinSummary | null = null;
  if (!solo) {
    if (won && match.pot > 0) coin = { delta: mine!.payout, note: '', pot: match.pot, houseFee: match.houseFee, net: mine!.payout - match.stake, potLabel: `Prize pot (${n} × ${match.stake.toLocaleString()})` };
    else if (draw && match.stake > 0) coin = { delta: 0, note: `Your ${match.stake.toLocaleString()} coin stake was returned` };
    else if (!won && !draw && match.stake > 0) coin = { delta: -match.stake, note: apex ? 'Only the fastest time takes the pot' : 'Your stake went to the winner' };
    else if (match.stake === 0) coin = null;
  }

  const standings: Standing[] = ranked.map((p, i) => ({
    key: p.userId, name: p.displayName, me: p.userId === mine?.userId, winner: apex ? i === 0 && ticks[p.seat] !== null : p.result === 'WON',
    place: apex ? (ticks[p.seat] !== null && ticks[p.seat] !== undefined ? i + 1 : null) : p.result === 'WON' ? 1 : p.result === 'DRAW' ? null : i + 1,
    right: apex ? (ticks[p.seat] !== null && ticks[p.seat] !== undefined ? fmtTime(ticks[p.seat] as number) : p.left ? 'left' : 'no time')
      : p.left ? 'left the game' : p.result === 'WON' ? 'Won' : p.result === 'DRAW' ? 'Draw' : 'Lost',
  }));
  if (!apex) { let place = 1; standings.forEach((s) => { if (s.place !== null) s.place = place++; }); }

  const chips: Chip[] = [];
  if (!solo) {
    chips.push({ label: 'Players', value: String(n) });
    if (match.stake > 0) chips.push({ label: 'Stake', value: match.stake.toLocaleString() });
    if (apex && myTicks !== null) chips.push({ label: 'Your time', value: fmtTime(myTicks) });
    else if (match.game === 'LUDO' && typeof match.state?.moves === 'number') chips.push({ label: 'Moves', value: String(match.state.moves) });
  }
  if (apex && myTicks !== null && myRank > 0 && ticks[ranked[0].seat] !== null) chips.push({ label: 'Behind 1st', value: `+${((myTicks - (ticks[ranked[0].seat] as number)) / 30).toFixed(2)}s` });

  return {
    outcome, title, subtitle, coin, standings: solo ? undefined : standings, chips,
    nextUp: solo && won ? `Level ${(Number(match.state?.level) || 0) + 1}` : null,
    balance: solo ? null : coins,
    delayMs: solo ? 600 : 900,
  };
}
