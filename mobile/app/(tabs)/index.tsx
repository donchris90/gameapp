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
  const [busy, setBusy] = useState<'daily' | 'ad' | 'join' | 'end' | null>(null);
  const [code, setCode] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState<Match | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [top, setTop] = useState<LeaderRow[]>([]);
  const [onlineNow, setOnlineNow] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [g, r, m, f, i, lb, on] = await Promise.all([
      api<GamesInfo>('/games', { auth: false }).catch(() => null), api<RewardsStatus>('/rewards').catch(() => null),
      api<Match | null>('/matches/current').catch(() => null), api<Friend[]>('/friends').catch(() => null),
      api<Invite[]>('/rooms/invites').catch(() => null), api<Leaderboard>('/leaderboard?period=week').catch(() => null),
      api<{ online: number }>('/online').catch(() => null),
    ]);
    if (g) setGames(g);
    if (r) setRewards(r);
    setLive(m && m.status === 'ACTIVE' ? m : null);
    if (f) setFriends(f);
    if (i) setInvites(i);
    if (lb) setTop(lb.top.slice(0, 3));
    if (on) setOnlineNow(on.online);
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

  const endGame = () => {
    if (!live) return;
    const solo = live.players.length === 1;
    Alert.alert(solo ? 'End this game?' : 'Resign this game?', live.stake > 0 ? `You will lose your ${live.stake.toLocaleString()} coin stake.` : 'The game ends and your progress in it is lost.', [
      { text: 'Keep playing', style: 'cancel' },
      { text: solo ? 'End game' : 'Resign', style: 'destructive', onPress: () => {
        setBusy('end');
        api(`/matches/${live.id}/forfeit`, { method: 'POST' }).then(() => load()).catch((e) => Alert.alert('End game', explain(e))).finally(() => setBusy(null));
      } },
    ]);
  };

  const acceptInvite = async (inv: Invite) => {
    try { await api(`/rooms/invites/${inv.id}/accept`, { method: 'POST' }); router.push('/room'); }
    catch (e) { Alert.alert('Join a room', explain(e)); await load(); }
  };

  const online = friends.filter((f) => f.online);
  const mySeat = live?.players.find((p) => p.userId === user?.id)?.seat;
  const opponents = live?.players.filter((p) => p.userId !== user?.id).map((p) => p.displayName).join(', ');
  const list = (Object.keys(GAME_INFO) as GameType[]);

  const tile = (g: GameType) => {
    const info = GAME_INFO[g];
    const server = games?.games.find((x) => x.game === g);
    const playable = !!server?.available && SCREEN_READY.has(g);
    return (
      <Pressable key={g} disabled={!playable} onPress={() => router.push(`/play/${g}`)} style={({ pressed }) => ({ width: '48.5%', opacity: playable ? (pressed ? 0.85 : 1) : 0.5, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <View style={{ backgroundColor: info.color, borderRadius: 22, padding: 14, minHeight: 118, justifyContent: 'space-between', overflow: 'hidden' }}>
          <View pointerEvents="none" style={{ position: 'absolute', right: -18, top: -18, width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,.14)' }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 30 }}>{info.emoji}</Text>
            {g === 'WHOT' ? <Text style={{ color: '#fff', fontWeight: '900', fontSize: 10, backgroundColor: 'rgba(0,0,0,.28)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' }}>NEW</Text> : !playable ? <Text style={{ color: '#fff', fontWeight: '900', fontSize: 10 }}>SOON</Text> : null}
          </View>
          <View>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{info.title}</Text>
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,.85)', fontSize: 12, fontWeight: '600' }}>{info.blurb}</Text>
          </View>
        </View>
      </Pressable>
    );
  };
  const heading = (title: string, action?: { label: string; onPress: () => void }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 24, marginBottom: 10 }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>{title}</Text>
      {action ? <Pressable onPress={action.onPress} hitSlop={8}><Text style={{ color: colors.accent, fontWeight: '800' }}>{action.label}</Text></Pressable> : null}
    </View>
  );

  return (
    <Screen>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.text} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <Pressable onPress={() => router.push('/me')}><Avatar name={user?.displayName ?? '?'} size={46} /></Pressable>
          <View style={{ flex: 1 }}>
            <Dim style={{ fontSize: 12, fontWeight: '600' }}>Welcome back</Dim>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 21, fontWeight: '900' }}>{user?.displayName}</Text>
          </View>
          <Pressable onPress={() => router.push('/leaderboard')} accessibilityLabel="Leaderboard" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,.07)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20 }}>🏆</Text></Pressable>
          <View style={{ height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: 'rgba(255,210,90,.12)', borderWidth: 1, borderColor: 'rgba(255,210,90,.3)', justifyContent: 'center' }}><Coins amount={coins} size={18} /></View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(46,213,115,.12)', borderWidth: 1, borderColor: 'rgba(46,213,115,.35)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.good }} />
            <Text style={{ color: colors.good, fontWeight: '900', fontSize: 13 }}>{onlineNow === null ? '…' : Math.max(onlineNow, 1).toLocaleString()} online now</Text>
          </View>
          {online.length ? <Text style={{ color: colors.dim, fontSize: 12, fontWeight: '700' }}>{online.length} of your friends</Text> : null}
        </View>

        {live ? (
          <View style={{ marginTop: 16, borderRadius: 26, padding: 18, backgroundColor: '#4B35D6', gap: 12, overflow: 'hidden' }}>
            <View pointerEvents="none" style={{ position: 'absolute', right: -30, top: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,.10)' }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#D7CEFF', fontWeight: '800', fontSize: 12, letterSpacing: 1.5 }}>JUMP BACK IN</Text>
              {live.turnSeat === mySeat && live.players.length > 1 ? <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12, backgroundColor: 'rgba(255,255,255,.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' }}>Your turn</Text> : null}
            </View>
            <View>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 25 }}>{GAME_INFO[live.game].emoji} {GAME_INFO[live.game].title}</Text>
              <Text style={{ color: '#D7CEFF', fontWeight: '600', marginTop: 4 }}>{opponents ? `vs ${opponents} · ` : ''}{live.pot > 0 ? `Pot ${live.pot.toLocaleString()} coins` : live.players.length > 1 ? 'Friendly match' : 'Solo puzzle'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => router.push(`/match/${live.id}`)} style={{ flex: 1, height: 48, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#2A1D8A', fontWeight: '900', fontSize: 15 }}>Resume</Text></Pressable>
              <Pressable onPress={endGame} disabled={busy === 'end'} style={{ height: 48, paddingHorizontal: 20, borderRadius: 15, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.55)', alignItems: 'center', justifyContent: 'center', opacity: busy === 'end' ? 0.5 : 1 }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{live.players.length === 1 ? 'End game' : 'Resign'}</Text></Pressable>
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <View style={{ flex: 1, borderRadius: 20, padding: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 4 }}>
            <Dim style={{ fontSize: 12, fontWeight: '700' }}>Daily bonus</Dim>
            <Text style={{ color: colors.gold, fontSize: 20, fontWeight: '900' }}>{rewards?.daily.available ? `+${rewards.daily.coins ?? ''} coins` : 'Collected'}</Text>
            <Button kind="gold" title={rewards?.daily.available ? 'Claim' : 'Come back tomorrow'} busy={busy === 'daily'} disabled={!rewards?.daily.available} onPress={claimDaily} style={{ marginTop: 6, minHeight: 38 }} />
            {rewards ? <Dim style={{ fontSize: 11 }}>Streak {rewards.daily.streak} day{rewards.daily.streak === 1 ? '' : 's'}</Dim> : null}
          </View>
          <View style={{ flex: 1, borderRadius: 20, padding: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 4 }}>
            <Dim style={{ fontSize: 12, fontWeight: '700' }}>Watch an ad</Dim>
            <Text style={{ color: colors.good, fontSize: 20, fontWeight: '900' }}>{rewards ? `+${rewards.ads.coinsPerAd} coins` : '…'}</Text>
            <Button kind="ghost" title={rewards ? 'Watch' : '…'} busy={busy === 'ad'} disabled={!rewards || rewards.ads.remainingToday <= 0} onPress={watchAd} style={{ marginTop: 6, minHeight: 38 }} />
            {rewards ? <Dim style={{ fontSize: 11 }}>{rewards.ads.remainingToday} left today</Dim> : null}
          </View>
        </View>

        {invites.length ? (
          <View style={{ marginTop: 16, gap: 8 }}>
            {invites.slice(0, 3).map((inv) => (
              <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.accent }}>
                <Text style={{ fontSize: 24 }}>{GAME_INFO[inv.room.game].emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{inv.from.displayName} invited you to {GAME_INFO[inv.room.game].title}</Text>
                  <Dim style={{ fontSize: 12 }}>{inv.room.stake > 0 ? `${inv.room.stake.toLocaleString()} coin stake` : 'Friendly game'}</Dim>
                </View>
                <Button title="Join" onPress={() => void acceptInvite(inv)} style={{ paddingHorizontal: 18, minHeight: 38 }} />
              </View>
            ))}
          </View>
        ) : null}

        {heading('Friends online', { label: 'See all', onPress: () => router.push('/friends') })}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
          {online.slice(0, 10).map((f) => (
            <Pressable key={f.id} onPress={() => router.push(`/player/${f.id}`)} style={{ width: 62, alignItems: 'center', gap: 6 }}>
              <Avatar name={f.displayName} size={52} online />
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{f.displayName}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => router.push('/friends')} style={{ width: 62, alignItems: 'center', gap: 6 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 24 }}>+</Text></View>
            <Text style={{ color: colors.dim, fontSize: 12, fontWeight: '600' }}>{online.length ? 'Invite' : 'Add friends'}</Text>
          </Pressable>
        </ScrollView>

        {heading('Play')}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {list.map((g) => tile(g))}
        </View>
        <View style={{ gap: 10, marginTop: 10 }}>
          <Pressable onPress={() => router.push('/apex')} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
            <View style={{ backgroundColor: '#B3202F', borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden' }}>
              <Text style={{ fontSize: 32 }}>🏎️</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>Apex Run</Text>
                <Text style={{ color: 'rgba(255,255,255,.85)', fontSize: 12, fontWeight: '600' }}>Story, tours and races. Race 5 rivals, tilt to steer.</Text>
              </View>
              <Text style={{ color: '#fff', fontWeight: '900' }}>Race ›</Text>
            </View>
          </Pressable>
        </View>

        {top.length ? (
          <>
            {heading('This week', { label: 'Leaderboard', onPress: () => router.push('/leaderboard') })}
            <View style={{ borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 4 }}>
              {top.map((r, i) => (
                <View key={r.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                  <Text style={{ width: 22, color: i === 0 ? colors.gold : colors.dim, fontWeight: '900' }}>{r.rank}</Text>
                  <Avatar name={r.displayName} size={30} />
                  <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontWeight: r.userId === user?.id ? '900' : '600' }}>{r.userId === user?.id ? 'You' : r.displayName}</Text>
                  <Dim style={{ fontSize: 13, fontWeight: '700' }}>{r.wins} win{r.wins === 1 ? '' : 's'}</Dim>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {heading('Have a room code?')}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}><Field label="" value={code} onChangeText={(t) => setCode(t.toUpperCase())} maxLength={6} autoCapitalize="characters" placeholder="ABC123" /></View>
          <Button title="Join" onPress={join} busy={busy === 'join'} disabled={code.trim().length !== 6} style={{ marginTop: 0 }} />
        </View>
      </ScrollView>
      <AdBanner />
    </Screen>
  );
}
