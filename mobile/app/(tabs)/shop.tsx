import { useFocusEffect } from 'expo-router';
import { useIAP } from '../../src/iap';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { ApiError, api, explain } from '../../src/api';
import { useSession } from '../../src/session';
import { Body, Button, Card, Coins, Dim, H1, Screen, colors } from '../../src/ui';

interface Pack { productId: string; coins: number; label: string }

/** Turns a finished store purchase into coins on the server. Returns true when the purchase can be closed. */
async function redeem(p: { id: string; productId: string; purchaseToken?: string | null }): Promise<'done' | 'retry'> {
  const ios = Platform.OS === 'ios';
  const token = ios ? p.id : p.purchaseToken;
  if (!token) return 'retry';
  try {
    await api('/store/purchases', { method: 'POST', body: { platform: ios ? 'APPLE' : 'GOOGLE', productId: p.productId, token } });
    return 'done';
  } catch (e) {
    // The server said no for good (bad receipt, already used, unknown pack): close it so it does not loop forever.
    if (e instanceof ApiError && ['INVALID_RECEIPT', 'RECEIPT_ALREADY_USED', 'UNKNOWN_PRODUCT'].includes(e.code)) return 'done';
    return 'retry'; // offline or server trouble: keep the purchase and try again next time
  }
}

export default function Shop() {
  const { refreshCoins, coins } = useSession();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const handling = useRef(new Set<string>());

  const settle = useCallback(async (purchase: any, finish: (a: { purchase: any; isConsumable?: boolean }) => Promise<void>) => {
    if (handling.current.has(purchase.id)) return;
    handling.current.add(purchase.id);
    try {
      if ((await redeem(purchase)) === 'done') {
        await finish({ purchase, isConsumable: true }).catch(() => undefined); // the server already consumed it on Android
        await refreshCoins();
        return true;
      }
      return false;
    } finally { handling.current.delete(purchase.id); }
  }, [refreshCoins]);

  const iap = useIAP({
    onPurchaseSuccess: async (purchase) => {
      const ok = await settle(purchase, (a) => iapRef.current!.finishTransaction(a));
      setBuying(null);
      if (ok) Alert.alert('Coins added', 'Thank you! Your coins are in your wallet.');
      else Alert.alert('Almost there', 'Your payment went through. We will add the coins as soon as we can reach the server.');
    },
    onPurchaseError: (e) => { setBuying(null); if (e.code !== 'user-cancelled') Alert.alert('Purchase failed', e.message); },
  });
  const iapRef = useRef(iap);
  iapRef.current = iap;

  useFocusEffect(useCallback(() => { api<{ packs: Pack[] }>('/store/packs').then((r) => setPacks(r.packs)).catch(() => undefined); void refreshCoins(); }, [refreshCoins]));

  // Ask the store for prices once connected, and finish any payment that never reached the server.
  useEffect(() => {
    if (!iap.connected || packs.length === 0) return;
    void iap.fetchProducts({ skus: packs.map((p) => p.productId), type: 'in-app' });
    void iap.getAvailablePurchases().then(() => undefined);
  }, [iap.connected, packs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    for (const p of iap.availablePurchases) void settle(p, (a) => iap.finishTransaction(a));
  }, [iap.availablePurchases]); // eslint-disable-line react-hooks/exhaustive-deps

  const buy = async (pack: Pack) => {
    setBuying(pack.productId);
    try {
      await iap.requestPurchase({ type: 'in-app', request: { apple: { sku: pack.productId }, google: { skus: [pack.productId] } } });
    } catch (e: any) { setBuying(null); if (!/cancel/i.test(String(e?.code ?? e?.message))) Alert.alert('Purchase failed', e?.message ?? explain(e)); }
  };

  const priceOf = (id: string) => iap.products.find((p) => p.id === id)?.displayPrice;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <H1>Get coins</H1>
          <Card style={{ paddingVertical: 8, paddingHorizontal: 12 }}><Coins amount={coins} /></Card>
        </View>
        <Dim style={{ marginBottom: 14 }}>Coins are used to play and stake in games. They cannot be cashed out.</Dim>
        {!iap.connected ? <Card style={{ marginBottom: 12 }}><Dim>The store is not available here. Purchases work in the real app from Google Play or the App Store.</Dim></Card> : null}
        <View style={{ gap: 10 }}>
          {packs.map((p) => (
            <Card key={p.productId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 30 }}>🪙</Text>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '800' }}>{p.label}</Body>
                <Coins amount={p.coins} size={18} />
              </View>
              <Button kind="gold" title={priceOf(p.productId) ?? 'Buy'} busy={buying === p.productId} disabled={!iap.connected || (!!buying && buying !== p.productId)} onPress={() => buy(p)} style={{ minWidth: 96 }} />
            </Card>
          ))}
        </View>
        <Dim style={{ marginTop: 16, fontSize: 12 }}>Free coins: take the daily bonus and watch rewarded ads on the Play tab.</Dim>
      </ScrollView>
    </Screen>
  );
}
