import { AdBanner } from '../../src/AdBanner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { showRewardedAd } from '../../src/ads';
import { api, explain } from '../../src/api';
import { GAME_INFO } from '../../src/games';
import { SCREEN_READY } from '../../src/config';
import { useSession } from '../../src/session';
import { Friend, GameType, GamesInfo, Invite, LeaderRow, Leaderboard, Match, RewardsStatus } from '../../src/types';
import { Avatar, Body, Button, Card, Coins, Dim, Field, H1, Screen, colors } from '../../src/ui';

export default function Home() {
  const { user, coins, refreshCoins } = useSession();
  const router = useRouter();
  const [games, setGames] = useState<GamesInfo | null>(null);
  const [rewards, setRewards] = useState<RewardsStatus | null>(null);
  const [busy, setBusy] = useState<'daily' | 'ad' | 'join' | null>(null);
  const [code, setCode] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState<Match | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [top, setTop] = useState<LeaderRow[]>([]);

  const load = useCallback(async () => {
    const [g, r, m, f, i, lb] = await Promise.all([
      api<GamesInfo>('/games', { auth: false }).catch(() => null), api<RewardsStatus>('/rewards').catch(() => null),
      api<Match | null>('/matches/current').catch(() => null), api<Friend[]>('/friends').catch(() => null),
      api<Invite[]>('/rooms/invites').catch(() => null), api<Leaderboard>('/leaderboard?period=week').catch(() => null),
    ]);
    if (g) setGames(g);
    if (r) setRewards(r);
    setLive(m && m.status === 'ACTIVE' ? m : null);
    if (f) setFriends(f);
    if (i) setInvites(i);
    if (lb) setTop(lb.top.slice(0, 3));
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

  const acceptInvite = async (inv: Invite) => {
    try { await api(`/rooms/invites/${inv.id}/accept`, { method: 'POST' }); router.push('/room'); }
    catch (e) { Alert.alert('Join a room', explain(e)); await load(); }
  };

  const online = friends.filter((f) => f.online);
  const mySeat = live?.players.find((p) => p.userId === user?.id)?.seat;
  const opponents = live?.players.filter((p) => p.userId !== user?.id).map((p) => p.displayName).join(', ');
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

        {live ? (
          <Pressable onPress={() => router.push(`/match/${live.id}`)} style={{ marginTop: 14 }}>
            <View style={{ borderRadius: 24, padding: 18, backgroundColor: '#5B3FEA', gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#D7CEFF', fontWeight: '800', fontSize: 12, letterSpacing: 1.5 }}>JUMP BACK IN</Text>
                {live.turnSeat === mySeat && live.players.length > 1 ? <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12, backgroundColor: 'rgba(255,255,255,.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' }}>Your turn</Text> : null}
              </View>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 24 }}>{GAME_INFO[live.game].title}{opponents ? ` vs ${opponents}` : ''}</Text>
              <Text style={{ color: '#D7CEFF', fontWeight: '600' }}>{live.pot > 0 ? `Pot ${live.pot.toLocaleString()} coins` : live.players.length > 1 ? 'Friendly match' : 'Solo puzzle'}</Text>
              <View style={{ height: 46, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#2A1D8A', fontWeight: '800', fontSize: 15 }}>Resume</Text></View>
            </View>
          </Pressable>
        ) : null}

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

        {invites.length ? (
          <View style={{ marginTop: 18, gap: 8 }}>
            {invites.slice(0, 3).map((inv) => (
              <Card key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '800', fontSize: 14 }}>{inv.from.displayName} invited you to {GAME_INFO[inv.room.game].title}</Body>
                  <Dim style={{ fontSize: 12 }}>{inv.room.stake > 0 ? `${inv.room.stake.toLocaleString()} coin stake` : 'Friendly'}</Dim>
                </View>
                <Button title="Join" onPress={() => void acceptInvite(inv)} style={{ paddingHorizontal: 16, minHeight: 38 }} />
              </Card>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22, marginBottom: 10 }}>
          <Body style={{ fontWeight: '800' }}>Friends online</Body>
          <Pressable onPress={() => router.push('/friends')}><Text style={{ color: colors.accent, fontWeight: '800' }}>See all</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
          {online.slice(0, 8).map((f) => (
            <Pressable key={f.id} onPress={() => router.push('/friends')} style={{ width: 62, alignItems: 'center', gap: 6 }}>
              <Avatar name={f.displayName} size={52} online />
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{f.displayName}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => router.push('/friends')} style={{ width: 62, alignItems: 'center', gap: 6 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 24 }}>+</Text></View>
            <Text style={{ color: colors.dim, fontSize: 12, fontWeight: '600' }}>{online.length ? 'Invite' : 'Add friends'}</Text>
          </Pressable>
        </ScrollView>

        <Body style={{ fontWeight: '800', marginTop: 22, marginBottom: 10 }}>Play</Body>
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

        <Pressable onPress={() => router.push('/apex')} style={{ marginTop: 12 }}>
          <View style={{ backgroundColor: '#B3202F', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={{ fontSize: 34 }}>🏎️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>Apex Run</Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)' }}>Race 5 rivals through traffic. Tilt to steer.</Text>
            </View>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Race ›</Text>
          </View>
        </Pressable>

        {top.length ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22, marginBottom: 10 }}>
              <Body style={{ fontWeight: '800' }}>This week</Body>
              <Pressable onPress={() => router.push('/leaderboard')}><Text style={{ color: colors.accent, fontWeight: '800' }}>Leaderboard</Text></Pressable>
            </View>
            <Card style={{ paddingVertical: 4, paddingHorizontal: 12 }}>
              {top.map((r, i) => (
                <View key={r.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                  <Text style={{ width: 22, color: i === 0 ? colors.gold : colors.dim, fontWeight: '900' }}>{r.rank}</Text>
                  <Avatar name={r.displayName} size={28} />
                  <Text style={{ flex: 1, color: colors.text, fontWeight: r.userId === user?.id ? '800' : '600' }} numberOfLines={1}>{r.userId === user?.id ? 'You' : r.displayName}</Text>
                  <Dim style={{ fontSize: 13 }}>{r.wins} win{r.wins === 1 ? '' : 's'}</Dim>
                </View>
              ))}
            </Card>
          </>
        ) : null}

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
