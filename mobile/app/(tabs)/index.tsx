import { AdBanner } from '../../src/AdBanner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { showRewardedAd } from '../../src/ads';
import { api, explain } from '../../src/api';
import { GAME_INFO } from '../../src/games';
import { SCREEN_READY } from '../../src/config';
import { useSession } from '../../src/session';
import { GameType, GamesInfo, RewardsStatus } from '../../src/types';
import { Body, Button, Card, Coins, Dim, Field, H1, Screen, colors } from '../../src/ui';

export default function Home() {
  const { user, coins, refreshCoins } = useSession();
  const router = useRouter();
  const [games, setGames] = useState<GamesInfo | null>(null);
  const [rewards, setRewards] = useState<RewardsStatus | null>(null);
  const [busy, setBusy] = useState<'daily' | 'ad' | 'join' | null>(null);
  const [code, setCode] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [g, r] = await Promise.all([api<GamesInfo>('/games', { auth: false }).catch(() => null), api<RewardsStatus>('/rewards').catch(() => null)]);
    if (g) setGames(g);
    if (r) setRewards(r);
    await refreshCoins();
  }, [refreshCoins]);

  useFocusEffect(useCallback(() => {
    void load();
    // Already in a room (for example after reopening the app)? Go back to it.
    api('/rooms/current').then((r: any) => { if (r?.status === 'WAITING') router.push('/room'); }).catch(() => undefined);
  }, [load, router]));

  const claimDaily = async () => {
    setBusy('daily');
    try { const r = await api<{ coins: number }>('/rewards/daily', { method: 'POST' }); Alert.alert('Daily bonus', `+${r.coins} coins`); await load(); }
    catch (e) { Alert.alert('Daily bonus', explain(e)); } finally { setBusy(null); }
  };

  const watchAd = async () => {
    setBusy('ad');
    try {
      const start = await api<{ nonce: string; userId: string; coins: number }>('/ads/rewarded/start', { method: 'POST' });
      const result = await showRewardedAd({ userId: start.userId, nonce: start.nonce });
      if (result === 'unavailable') { Alert.alert('No ad right now', 'Try again in a moment.'); return; }
      if (result === 'closed') { Alert.alert('Ad closed early', 'Watch the whole ad to earn coins.'); return; }
      // The ad network tells our server, and the server pays. Give that a few seconds.
      const before = coins;
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const w = await api<{ coins: number }>('/wallet');
        if (w.coins > before) break;
      }
      await load();
    } catch (e) { Alert.alert('Watch an ad', explain(e)); } finally { setBusy(null); }
  };

  const join = async () => {
    setBusy('join');
    try { await api('/rooms/join', { method: 'POST', body: { code: code.trim().toUpperCase() } }); setCode(''); router.push('/room'); }
    catch (e) { Alert.alert('Join a room', explain(e)); } finally { setBusy(null); }
  };

  const list = (Object.keys(GAME_INFO) as GameType[]);

  return (
    <Screen>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.text} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <View><Dim>Hi,</Dim><H1>{user?.displayName}</H1></View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Pressable onPress={() => router.push('/leaderboard')}><Card style={{ paddingVertical: 10, paddingHorizontal: 12 }}><Text style={{ fontSize: 20 }}>🏆</Text></Card></Pressable>
            <Card style={{ paddingVertical: 10, paddingHorizontal: 14 }}><Coins amount={coins} size={20} /></Card>
          </View>
        </View>

        <Card style={{ marginTop: 14, gap: 10 }}>
          <Body style={{ fontWeight: '800' }}>Free coins</Body>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              style={{ flex: 1 }} kind="gold" busy={busy === 'daily'} disabled={!rewards?.daily.available}
              title={rewards?.daily.available ? `Daily bonus +${rewards.daily.coins}` : 'Bonus taken'} onPress={claimDaily} />
            <Button
              style={{ flex: 1 }} kind="ghost" busy={busy === 'ad'} disabled={!rewards || rewards.ads.remainingToday <= 0}
              title={rewards ? `Watch ad +${rewards.ads.coinsPerAd}` : 'Watch ad'} onPress={watchAd} />
          </View>
          {rewards ? <Dim style={{ fontSize: 12 }}>Streak {rewards.daily.streak} day{rewards.daily.streak === 1 ? '' : 's'} · {rewards.ads.remainingToday} ad{rewards.ads.remainingToday === 1 ? '' : 's'} left today</Dim> : null}
        </Card>

        <Body style={{ fontWeight: '800', marginTop: 22, marginBottom: 10 }}>Games</Body>
        <View style={{ gap: 12 }}>
          {list.map((g) => {
            const info = GAME_INFO[g];
            const server = games?.games.find((x) => x.game === g);
            const playable = !!server?.available && SCREEN_READY.has(g);
            return (
              <Pressable key={g} disabled={!playable} onPress={() => router.push(`/play/${g}`)} style={{ opacity: playable ? 1 : 0.55 }}>
                <View style={{ backgroundColor: info.color, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Text style={{ fontSize: 34 }}>{info.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{info.title}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.85)' }}>{info.blurb}</Text>
                  </View>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{playable ? 'Play ›' : 'Soon'}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Body style={{ fontWeight: '800', marginTop: 22, marginBottom: 10 }}>Have a room code?</Body>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}><Field label="" value={code} onChangeText={(t) => setCode(t.toUpperCase())} maxLength={6} autoCapitalize="characters" placeholder="ABC123" /></View>
          <Button title="Join" onPress={join} busy={busy === 'join'} disabled={code.trim().length !== 6} style={{ marginTop: 0 }} />
        </View>
      </ScrollView>
      <AdBanner />
    </Screen>
  );
}
