import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
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
        <View style={{ alignItems: 'center', marginTop: 16, gap: 6 }}>
          <Avatar name={user.displayName} size={72} frame={equipped?.frame} />
          <H1>{user.displayName}</H1>
          <Dim>@{user.username}{titleText(equipped?.title) ? `  ·  ${titleText(equipped?.title)}` : ''}</Dim>
          <Coins amount={coins} size={22} />
        </View>

        <Card style={{ marginTop: 16, alignItems: 'center', gap: 4 }}>
          <Dim>Your friend code</Dim>
          <Text onPress={async () => { await Clipboard.setStringAsync(user.friendCode); Alert.alert('Copied', 'Friend code copied.'); }} style={{ color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: 4 }}>{user.friendCode}</Text>
          <Dim style={{ fontSize: 12 }}>Tap to copy. Friends can add you with it.</Dim>
        </Card>

        <Button style={{ marginTop: 12 }} kind="ghost" title="✨ Customize: frames, titles, boards" onPress={() => router.push('/cosmetics')} />

        <Button style={{ marginTop: 10 }} kind="ghost" title={sound ? '🔊 Sound and vibration: on' : '🔇 Sound and vibration: off'} onPress={() => { const n = !sound; setSound(n); void setSoundOn(n); }} />

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

        <Button title="Log out" kind="ghost" style={{ marginTop: 24 }} onPress={() => Alert.alert('Log out', 'Log out of PlayCircle?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: () => void signOut() }])} />
      </ScrollView>
    </Screen>
  );
}
