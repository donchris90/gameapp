import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { api, explain } from '../src/api';
import { ShopItem, loadShop, setShop, useShop } from '../src/cosmetics';
import { useSession } from '../src/session';
import { Avatar, Body, Button, Card, Coins, Dim, H1, Screen, colors } from '../src/ui';

const KINDS: Array<{ kind: ShopItem['kind']; title: string }> = [
  { kind: 'FRAME', title: 'Avatar frames' }, { kind: 'TITLE', title: 'Titles' }, { kind: 'THEME', title: 'Board themes' },
];

export default function Cosmetics() {
  const router = useRouter();
  const { user, coins, refreshCoins } = useSession();
  const shop = useShop();
  const [busy, setBusy] = useState<string | null>(null);
  if (!user) return null;

  const run = async (id: string, fn: () => Promise<any>) => {
    setBusy(id);
    try { await fn(); await Promise.all([loadShop(), refreshCoins()]); } catch (e) { Alert.alert('Could not do that', explain(e)); } finally { setBusy(null); }
  };
  const buy = (i: ShopItem) => Alert.alert(`Buy ${i.name}?`, `This costs ${i.price} coins.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Buy', onPress: () => void run(i.id, async () => { await api(`/shop/items/${i.id}/buy`, { method: 'POST' }); setShop(await api('/shop/items/' + i.id + '/equip', { method: 'POST' })); }) },
  ]);
  const equip = (i: ShopItem) => void run(i.id, async () => setShop(await api(`/shop/items/${i.id}/equip`, { method: 'POST' })));
  const unequip = (kind: ShopItem['kind']) => void run(kind, async () => setShop(await api(`/shop/unequip/${kind.toLowerCase()}`, { method: 'POST' })));

  const wearing = (i: ShopItem) => !!shop && [shop.equipped.frame, shop.equipped.title, shop.equipped.theme].includes(i.id);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text onPress={() => router.back()} style={{ color: colors.dim, fontSize: 16, marginVertical: 8 }}>‹ Back</Text>
        <H1>Customize</H1>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Dim>These only change how you look. They never help you win.</Dim>
          <Coins amount={coins} />
        </View>
        {!shop ? <Dim style={{ marginTop: 24, textAlign: 'center' }}>Loading…</Dim> : KINDS.map(({ kind, title }) => (
          <View key={kind} style={{ marginTop: 20, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Body style={{ fontWeight: '800' }}>{title}</Body>
              {kind !== 'THEME' ? <Text onPress={() => unequip(kind)} style={{ color: colors.dim }}>Take off</Text> : null}
            </View>
            {shop.items.filter((i) => i.kind === kind).map((i) => (
              <Card key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                {kind === 'FRAME' ? <Avatar name={user.displayName} size={44} frame={i.id} />
                  : kind === 'THEME' ? <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: i.look.board, borderWidth: 3, borderColor: i.look.accent }} />
                  : <Text style={{ fontSize: 22 }}>🏷️</Text>}
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>{kind === 'TITLE' ? i.look.text : i.name}</Body>
                  <Dim>{i.owned ? (wearing(i) ? 'Wearing' : 'Owned') : `${i.price} coins`}</Dim>
                </View>
                {i.owned
                  ? <Button title={wearing(i) ? 'On' : 'Wear'} kind={wearing(i) ? 'ghost' : 'primary'} disabled={wearing(i)} busy={busy === i.id} onPress={() => equip(i)} />
                  : <Button title={`Buy ${i.price}`} disabled={coins < i.price} busy={busy === i.id} onPress={() => buy(i)} />}
              </Card>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
