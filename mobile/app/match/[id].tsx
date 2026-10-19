import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { api, explain } from '../../src/api';
import { preloadInterstitial, showInterstitial } from '../../src/ads';
import { Ayo } from '../../src/games/Ayo';
import { Ludo } from '../../src/games/Ludo';
import { TicTacToe } from '../../src/games/TicTacToe';
import { WaterSort } from '../../src/games/WaterSort';
import { GAME_INFO } from '../../src/games';
import { useSession, useSocketEvent } from '../../src/session';
import { Match } from '../../src/types';
import { useCountdown } from '../../src/useCountdown';
import { titleText } from '../../src/cosmetics';
import { onSoundChange, setSoundOn, sfx, soundOn } from '../../src/sfx';
import { EmoteControls } from '../../src/Emotes';
import { VoiceButton } from '../../src/Voice';
import { Avatar, Body, Button, Card, Coins, Dim, Screen, colors } from '../../src/ui';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, refreshCoins } = useSession();
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
        // Every finished game is followed by a full-screen ad. Coins were already paid by the server, so this never delays a payout.
        if (prev && !adShown.current) { adShown.current = true; setTimeout(() => { void showInterstitial(); }, 2200); }
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
  const bg = ({ TICTACTOE: '#0B1020', AYO: '#1C1009', LUDO: '#120F2B', WATER_SORT: '#111111' } as Record<string, string>)[match.game];
  const onAuto = !over && !!match.autoPlay?.includes(user.id);
  const takeBack = () => api<Match>(`/matches/${match.id}/resume`, { method: 'POST' }).then(accept).catch((e) => Alert.alert('Take back control', explain(e)));
  const quitToHome = () => api<Match>(`/matches/${match.id}/forfeit`, { method: 'POST' }).then((m) => { accept(m); goBack(); }).catch(() => goBack());
  const props = { match, mySeat, onMove: send, busy, height: gameH };

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
            : <WaterSort {...props} onQuit={quitToHome} />
        ) : null}
      </View>

      {!over ? (
        solo ? null : <Pressable onPress={resign} style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 22, marginVertical: 6 }}><Text style={{ color: colors.dim, fontWeight: '800' }}>Resign</Text></Pressable>
      ) : (
        <Card style={{ marginVertical: 8, gap: 8, alignItems: 'center' }}>
          {mine?.result === 'WON' && match.pot > 0 ? <Body>You won <Text style={{ color: colors.gold, fontWeight: '900' }}>{mine.payout.toLocaleString()}</Text> coins</Body> : null}
          {mine?.result === 'DRAW' && match.stake > 0 ? <Body>Your {match.stake.toLocaleString()} coins were returned</Body> : null}
          {mine?.result === 'LOST' && match.stake > 0 ? <Body>You lost {match.stake.toLocaleString()} coins</Body> : null}
          {solo ? null : match.endReason === 'TIMEOUT' ? <Dim>Out of time</Dim> : match.endReason === 'FORFEIT' ? <Dim>Resigned</Dim> : null}
          {theyWant ? <Body style={{ color: colors.gold, fontWeight: '800' }}>🔁 {theyWant} wants a rematch</Body> : null}
          <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
            {solo ? null : <Button title={theyWant ? 'Accept rematch' : 'Rematch'} onPress={rematch} busy={rematchBusy} style={{ flex: 1 }} />}
            {solo ? <Button title={mine?.result === 'WON' ? 'Next level' : 'Try again'} onPress={playAgain} busy={busy} style={{ flex: 1 }} /> : null}
            <Button title={solo ? 'Home' : 'Back to lobby'} kind="ghost" onPress={goBack} style={{ flex: 1 }} />
          </View>
        </Card>
      )}
    </Screen>
  );
}
