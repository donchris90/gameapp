import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../../src/api';
import { titleText, useShop } from '../../src/cosmetics';
import { setSoundOn, soundOn } from '../../src/sfx';
import { GAME_INFO } from '../../src/games';
import { useSession } from '../../src/session';
import { GameType } from '../../src/types';
import { Avatar, Body, Button, Card, Coins, Dim, Empty, H1, Screen, colors } from '../../src/ui';

type HistoryRow = { matchId: string; game: GameType; stake: number; result: 'WON' | 'LOST' | 'DRAW'; net: number; opponents: Array<{ displayName: string }>; finishedAt: string };
type LedgerRow = { id: string; type: string; amount: number; balanceAfter: number | null; createdAt: string };

const LABEL: Record<string, string> = {
  SIGNUP_BONUS: 'Welcome bonus', DAILY_BONUS: 'Daily bonus', AD_REWARD: 'Ad reward', COIN_PURCHASE: 'Coin pack',
  GAME_STAKE: 'Game stake', GAME_PAYOUT: 'Game winnings', GAME_REFUND: 'Stake returned', SHOP_PURCHASE: 'Shop', ADJUSTMENT: 'Adjustment',
};

export default function Me() {
  const { user, coins, signOut, refreshCoins } = useSession();
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const shop = useShop();
  const equipped = shop?.equipped;
  const router = useRouter();
  const [sound, setSound] = useState(soundOn());
  const [tab, setTab] = useState<'games' | 'coins'>('games');

  useFocusEffect(useCallback(() => {
    void refreshCoins();
    api<{ matches: HistoryRow[] }>('/matches/history?limit=20').then((r) => setHistory(r.matches)).catch(() => undefined);
    api<{ entries: LedgerRow[] }>('/wallet/ledger?limit=30').then((r) => setLedger(r.entries)).catch(() => undefined);
  }, [refreshCoins]));

  if (!user) return null;
  const wins = history.filter((h) => h.result === 'WON').length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ marginTop: 8, marginBottom: 16, borderRadius: 26, padding: 20, backgroundColor: '#21194D', borderWidth: 1, borderColor: '#4A3A89', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -36, top: -46, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(124,92,255,.18)' }} />
          <Text style={{ color: '#B9A9FF', fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 14 }}>PLAYER PROFILE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar name={user.displayName} size={76} frame={equipped?.frame} />
            <View style={{ flex: 1 }}>
              <H1>{user.displayName}</H1>
              <Dim>@{user.username}</Dim>
              {titleText(equipped?.title) ? <Text style={{ color: '#E2D9FF', fontWeight: '800', marginTop: 4 }}>{titleText(equipped?.title)}</Text> : null}
              <View style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(46,213,115,.12)' }}>
                <Text style={{ color: colors.good, fontSize: 11, fontWeight: '900' }}>● PLAYER ACCOUNT</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            <View style={{ flex: 1, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.07)', padding: 12 }}>
              <Dim style={{ fontSize: 11 }}>Coin balance</Dim><Coins amount={coins} size={19} />
            </View>
            <View style={{ flex: 1, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.07)', padding: 12 }}>
              <Dim style={{ fontSize: 11 }}>Games won</Dim><Text style={{ color: '#fff', fontSize: 21, fontWeight: '900' }}>{wins}</Text>
            </View>
          </View>
        </View>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(124,92,255,.18)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22 }}>🔗</Text></View>
            <View style={{ flex: 1 }}><Body style={{ fontWeight: '900' }}>Your friend code</Body><Dim style={{ fontSize: 12 }}>Share it so people can add you.</Dim></View>
            <Pressable onPress={async () => { await Clipboard.setStringAsync(user.friendCode); Alert.alert('Copied', 'Friend code copied.'); }} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.accent }}><Text style={{ color: '#fff', fontWeight: '900' }}>Copy</Text></Pressable>
          </View>
          <Text onPress={async () => { await Clipboard.setStringAsync(user.friendCode); Alert.alert('Copied', 'Friend code copied.'); }} style={{ color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: 4, textAlign: 'center', paddingVertical: 8 }}>{user.friendCode}</Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Button style={{ flex: 1 }} title="✨ Customize profile" onPress={() => router.push('/cosmetics')} />
          <Button style={{ flex: 1 }} kind="ghost" title={sound ? '🔊 Sound on' : '🔇 Sound off'} onPress={() => { const n = !sound; setSound(n); void setSoundOn(n); }} />
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Button style={{ flex: 1 }} kind={tab === 'games' ? 'primary' : 'ghost'} title={`Games (${wins} won)`} onPress={() => setTab('games')} />
          <Button style={{ flex: 1 }} kind={tab === 'coins' ? 'primary' : 'ghost'} title="Coin history" onPress={() => setTab('coins')} />
        </View>

        {tab === 'games' ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            {history.length === 0 ? <Empty text="No games yet. Play one!" /> : null}
            {history.map((h) => (
              <Card key={h.matchId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <Text style={{ fontSize: 26 }}>{GAME_INFO[h.game].emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>{h.result === 'WON' ? 'Won' : h.result === 'LOST' ? 'Lost' : 'Draw'} vs {h.opponents.map((o) => o.displayName).join(', ') || '—'}</Body>
                  <Dim>{GAME_INFO[h.game].title}</Dim>
                </View>
                <Text style={{ color: h.net > 0 ? colors.good : h.net < 0 ? colors.bad : colors.dim, fontWeight: '800' }}>{h.net > 0 ? '+' : ''}{h.net}</Text>
              </Card>
            ))}
          </View>
        ) : (
          <View style={{ marginTop: 12, gap: 8 }}>
            {ledger.length === 0 ? <Empty text="Nothing yet." /> : null}
            {ledger.map((e) => (
              <Card key={e.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
                <View style={{ flex: 1 }}><Body style={{ fontWeight: '700' }}>{LABEL[e.type] ?? e.type}</Body><Dim style={{ fontSize: 12 }}>{new Date(e.createdAt).toLocaleString()}</Dim></View>
                <Text style={{ color: e.amount >= 0 ? colors.good : colors.bad, fontWeight: '800' }}>{e.amount > 0 ? '+' : ''}{e.amount}</Text>
              </Card>
            ))}
          </View>
        )}

        <Text onPress={() => router.push('/delete-account')} style={{ color: colors.dim, textAlign: 'center', marginTop: 18, textDecorationLine: 'underline' }}>Delete my account</Text>
        <Button title="Log out" kind="ghost" style={{ marginTop: 24 }} onPress={() => Alert.alert('Log out', 'Log out of PlayCircle?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: () => void signOut() }])} />
      </ScrollView>
    </Screen>
  );
}
