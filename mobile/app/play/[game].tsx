import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { api, explain } from '../../src/api';
import { GAME_INFO } from '../../src/games';
import { HOW_TO_PLAY } from '../../src/howto';
import { useSession, useSocketEvent } from '../../src/session';
import { GameType, GamesInfo } from '../../src/types';
import { Body, Button, Card, Chip, Coins, Dim, H1, Screen, colors } from '../../src/ui';

export default function PlayScreen() {
  const { game: raw } = useLocalSearchParams<{ game: string }>();
  const game = raw as GameType;
  const info = GAME_INFO[game];
  const { coins, refreshCoins } = useSession();
  const router = useRouter();
  const [meta, setMeta] = useState<GamesInfo | null>(null);
  const [stake, setStake] = useState(0);
  const [size, setSize] = useState(2);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => { api<GamesInfo>('/games', { auth: false }).then(setMeta).catch(() => undefined); void refreshCoins(); }, [refreshCoins]);
  const cfg = meta?.games.find((g) => g.game === game);
  const ranged = !!cfg && cfg.maxPlayers > cfg.minPlayers;
  useEffect(() => { if (cfg) setSize(cfg.maxPlayers > 2 ? 2 : cfg.maxPlayers); }, [cfg?.maxPlayers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving this screen while searching cancels the search.
  useEffect(() => () => { api('/matchmaking/queue', { method: 'DELETE' }).catch(() => undefined); }, []);

  useSocketEvent('match:timeout', () => { setSearching(false); Alert.alert('No opponent found', 'Nobody was looking for the same game. Try again or invite a friend.'); });
  useSocketEvent<any>('match:failed', (p) => { setSearching(false); Alert.alert('Match cancelled', p?.reason === 'INSUFFICIENT_COINS' ? 'Someone did not have enough coins.' : 'The match could not start. Try again.'); });

  const quick = async () => {
    setBusy(true);
    try { await api('/matchmaking/queue', { method: 'POST', body: { game, stake, ...(ranged ? { size } : {}) } }); setSearching(true); }
    catch (e) { Alert.alert('Quick match', explain(e)); } finally { setBusy(false); }
  };
  const cancel = async () => { await api('/matchmaking/queue', { method: 'DELETE' }).catch(() => undefined); setSearching(false); };
  const withFriends = async () => {
    setBusy(true);
    try { await api('/rooms', { method: 'POST', body: { game, stake, ...(ranged ? { maxPlayers: size } : {}) } }); router.replace('/room'); }
    catch (e) { Alert.alert('Create room', explain(e)); } finally { setBusy(false); }
  };

  if (!info) return null;
  const solo = cfg ? cfg.maxPlayers === 1 : game === 'WATER_SORT';
  if (solo) {
    const startSolo = async () => {
      setBusy(true);
      try { const m = await api<{ id: string }>('/matches/solo', { method: 'POST', body: { game } }); router.replace(`/match/${m.id}`); }
      catch (e) { Alert.alert(info.title, explain(e)); } finally { setBusy(false); }
    };
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <Pressable onPress={() => router.back()} style={{ paddingVertical: 12 }}><Text style={{ color: colors.accent, fontWeight: '700' }}>‹ Back</Text></Pressable>
          <Text style={{ fontSize: 44 }}>{info.emoji}</Text>
          <H1>{info.title}</H1>
          <Dim style={{ marginBottom: 10 }}>A puzzle just for you. Sort the colours before the clock runs out.</Dim>
          <Card style={{ marginBottom: 16, gap: 6 }}>
            <Body style={{ fontWeight: '800' }}>How to play</Body>
            {HOW_TO_PLAY[game].map((t, i) => <Dim key={i}>{i + 1}. {t}</Dim>)}
          </Card>
          <Button title="Start puzzle" onPress={startSolo} busy={busy} />
        </ScrollView>
      </Screen>
    );
  }
  const stakes = meta?.stakes ?? [0, 50, 100, 250, 500, 1000, 5000];
  const pot = stake * (ranged ? size : 2);
  const fee = Math.floor((pot * (meta?.houseFeePercent ?? 10)) / 100);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 12 }}><Text style={{ color: colors.accent, fontWeight: '700' }}>‹ Back</Text></Pressable>
        <View style={{ borderRadius: 24, padding: 20, marginBottom: 16, backgroundColor: info.color, overflow: 'hidden', gap: 8 }}>
          <Text style={{ fontSize: 42 }}>{info.emoji}</Text>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>{info.title}</Text>
          <Text style={{ color: 'rgba(255,255,255,.88)', fontSize: 14, fontWeight: '600' }}>{info.blurb}</Text>
          <Text style={{ color: 'rgba(255,255,255,.82)', fontSize: 12, fontWeight: '800', marginTop: 4 }}>CHOOSE YOUR MATCH</Text>
        </View>
        <Card style={{ marginBottom: 16, gap: 6 }}>
          <Text onPress={() => setHelp((h) => !h)} style={{ color: colors.text, fontWeight: '800' }}>{help ? '▾' : '▸'} How to play</Text>
          {help ? HOW_TO_PLAY[game].map((t, i) => <Dim key={i}>{i + 1}. {t}</Dim>) : null}
        </Card>

        <Body style={{ fontWeight: '800', marginBottom: 8 }}>Entry option</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {stakes.map((s) => <Chip key={s} label={s === 0 ? 'Free' : s.toLocaleString()} selected={stake === s} disabled={s > coins} onPress={() => setStake(s)} />)}
        </View>
        <View style={{ marginTop: 8 }}><Dim>You have <Text style={{ color: colors.gold }}>{coins.toLocaleString()}</Text> coins</Dim></View>

        {ranged && cfg ? (
          <>
            <Body style={{ fontWeight: '800', marginTop: 18, marginBottom: 8 }}>Number of players</Body>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {Array.from({ length: cfg.maxPlayers - cfg.minPlayers + 1 }, (_, i) => cfg.minPlayers + i).map((n) => (
                <Chip key={n} label={`${n}`} selected={size === n} onPress={() => setSize(n)} />
              ))}
            </View>
          </>
        ) : null}

        <Card style={{ marginTop: 18 }}>
          {stake === 0 ? <Dim>Friendly game: no coins change hands.</Dim> : (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Dim>Prize pot</Dim><Coins amount={pot} /></View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Dim>Winner receives</Dim><Coins amount={pot - fee} /></View>
              <Dim style={{ fontSize: 12 }}>A draw gives every stake back. Coins can only be used in the app.</Dim>
            </View>
          )}
        </Card>

        <View style={{ gap: 12, marginTop: 20 }}>
          {searching ? (
            <Card style={{ alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 28 }}>🔎</Text>
              <Body>Looking for an opponent…</Body>
              <Button title="Cancel" kind="ghost" onPress={cancel} />
            </Card>
          ) : (
            <>
              {game === 'APEX' ? null : <Button title="Quick match" onPress={quick} busy={busy} />}
              <Button title={game === 'APEX' ? 'Create race room' : 'Create room · Play with friends'} kind={game === 'APEX' ? 'primary' : 'ghost'} onPress={withFriends} busy={busy} />
              {game === 'APEX' ? <Dim style={{ textAlign: 'center' }}>Races are for friends: share the room code or invite them from the lobby.</Dim> : null}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
