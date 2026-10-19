import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { api, explain } from '../../src/api';
import { Ayo } from '../../src/games/Ayo';
import { Ludo } from '../../src/games/Ludo';
import { TicTacToe } from '../../src/games/TicTacToe';
import { WaterSort } from '../../src/games/WaterSort';
import { GAME_INFO } from '../../src/games';
import { useSession, useSocketEvent } from '../../src/session';
import { Match } from '../../src/types';
import { useCountdown } from '../../src/useCountdown';
import { titleText } from '../../src/cosmetics';
import { sfx } from '../../src/sfx';
import { Avatar, Body, Button, Card, Coins, Dim, Screen, colors } from '../../src/ui';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, refreshCoins } = useSession();
  const [match, setMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const latest = useRef(0);

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
    try { const m = await api<Match>('/matches/solo', { method: 'POST', body: { game: match.game } }); router.replace(`/match/${m.id}`); }
    catch (e) { Alert.alert('New puzzle', explain(e)); } finally { setBusy(false); }
  };
  const goBack = async () => {
    const room = await api('/rooms/current').catch(() => null);
    router.replace(room ? '/room' : '/(tabs)');
  };

  const solo = match.players.length === 1; // a puzzle played alone (Water Sort)
  const resultText = !over ? '' : solo ? (mine?.result === 'WON' ? 'Solved! 🎉' : match.endReason === 'FORFEIT' ? 'You gave up' : "Time's up") : mine?.result === 'WON' ? 'You won! 🎉' : mine?.result === 'DRAW' ? 'Draw' : 'You lost';
  const status = over ? resultText : solo ? 'Sort the colours' : myTurn ? (match.game === 'LUDO' && match.state.phase === 'ROLL' ? 'Your turn: roll' : 'Your turn') : `Waiting for ${match.players.find((p) => p.seat === match.turnSeat)?.displayName ?? 'opponent'}`;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
        <Body style={{ fontWeight: '800' }}>{info.emoji} {info.title}</Body>
        {match.pot > 0 ? <Coins amount={match.pot} /> : <Dim>{solo ? 'Solo puzzle' : 'Friendly'}</Dim>}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12, display: solo ? 'none' : 'flex' }}>
        {match.players.map((p) => {
          const active = !over && match.turnSeat === p.seat;
          return (
            <View key={p.userId} style={{ alignItems: 'center', gap: 4, opacity: p.left ? 0.4 : 1 }}>
              <View style={{ padding: 3, borderRadius: 30, borderWidth: 2, borderColor: active ? colors.accent : 'transparent' }}><Avatar name={p.displayName} size={48} frame={p.frame} /></View>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{p.userId === user.id ? 'You' : p.displayName}</Text>
              {titleText(p.title) ? <Text style={{ color: colors.dim, fontSize: 11 }}>{titleText(p.title)}</Text> : null}
              {match.game === 'TICTACTOE' ? <Text style={{ color: p.seat === 0 ? colors.x : colors.o, fontWeight: '900', fontSize: 18 }}>{match.state.marks[p.seat]}</Text> : null}
            </View>
          );
        })}
      </View>

      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ color: over ? (mine?.result === 'WON' ? colors.good : colors.text) : myTurn ? colors.accent : colors.dim, fontSize: 20, fontWeight: '900' }}>{status}</Text>
        {seconds !== null ? <Text style={{ color: seconds <= 8 ? colors.bad : colors.dim, fontWeight: '800', marginTop: 4 }}>{solo ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : `${seconds}s`}</Text> : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {match.game === 'TICTACTOE' ? <TicTacToe match={match} mySeat={mySeat} onMove={send} busy={busy} />
          : match.game === 'AYO' ? <Ayo match={match} mySeat={mySeat} onMove={send} busy={busy} />
          : match.game === 'LUDO' ? <Ludo match={match} mySeat={mySeat} onMove={send} busy={busy} />
          : <WaterSort match={match} mySeat={mySeat} onMove={send} busy={busy} />}
      </ScrollView>
      {!over ? (
        <Button title={solo ? 'Give up' : 'Resign'} kind="ghost" onPress={resign} style={{ marginBottom: 16 }} />
      ) : (
        <Card style={{ marginBottom: 16, gap: 10, alignItems: 'center' }}>
          {mine?.result === 'WON' ? <Body>You won <Text style={{ color: colors.gold, fontWeight: '900' }}>{mine.payout.toLocaleString()}</Text> coins</Body> : null}
          {mine?.result === 'DRAW' && match.stake > 0 ? <Body>Your {match.stake.toLocaleString()} coins were returned</Body> : null}
          {mine?.result === 'LOST' && match.stake > 0 ? <Body>You lost {match.stake.toLocaleString()} coins</Body> : null}
          {solo ? null : match.endReason === 'TIMEOUT' ? <Dim>Out of time</Dim> : match.endReason === 'FORFEIT' ? <Dim>Resigned</Dim> : null}
          {solo ? <Button title="New puzzle" onPress={playAgain} busy={busy} style={{ alignSelf: 'stretch' }} /> : null}
          <Button title={solo ? 'Home' : 'Back to lobby'} kind={solo ? 'ghost' : 'primary'} onPress={goBack} style={{ alignSelf: 'stretch' }} />
        </Card>
      )}
    </Screen>
  );
}
