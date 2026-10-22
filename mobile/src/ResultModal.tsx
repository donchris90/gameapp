import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button, colors } from './ui';

export type Outcome = 'WON' | 'LOST' | 'DRAW' | 'PLACE' | 'SOLVED' | 'FAILED';

export interface Standing { key: string; place: number | null; name: string; right: string; me?: boolean; winner?: boolean }
export interface Chip { label: string; value: string }
export interface CoinSummary { delta: number; note: string; pot?: number; houseFee?: number; net?: number; potLabel?: string }

export interface ResultModalProps {
  outcome: Outcome;
  title: string;
  subtitle: string;
  coin?: CoinSummary | null;
  standings?: Standing[];
  chips?: Chip[];
  nextUp?: string | null;
  banner?: string | null;
  balance?: number | null;
  primary: { title: string; onPress: () => void; busy?: boolean };
  secondary: { title: string; onPress: () => void };
  /** Wait this long before the card appears so the last move is seen on the board. */
  delayMs?: number;
}

const LOOK: Record<Outcome, { tint: string; ring: string; fg: string; grad: [string, string]; box: string; boxLine: string }> = {
  WON: { tint: '#FFD25A', ring: 'rgba(255,200,61,.22)', fg: '#3B2A00', grad: ['#FFE27A', '#F2A900'], box: 'rgba(255,210,90,.10)', boxLine: 'rgba(255,210,90,.28)' },
  LOST: { tint: '#F87171', ring: 'rgba(248,113,113,.18)', fg: '#F4A3A3', grad: ['#46506F', '#262D47'], box: 'rgba(248,113,113,.07)', boxLine: 'rgba(248,113,113,.25)' },
  DRAW: { tint: '#8FB0FF', ring: 'rgba(111,149,232,.2)', fg: '#FFFFFF', grad: ['#6F95E8', '#3C5FAE'], box: 'rgba(111,149,232,.08)', boxLine: 'rgba(111,149,232,.28)' },
  PLACE: { tint: '#E3E8F5', ring: 'rgba(217,222,234,.2)', fg: '#2A3150', grad: ['#D9DEEA', '#8C95AE'], box: 'rgba(255,255,255,.05)', boxLine: 'rgba(255,255,255,.12)' },
  SOLVED: { tint: '#5FE0B8', ring: 'rgba(95,224,184,.2)', fg: '#06352B', grad: ['#5FE0B8', '#14A383'], box: 'rgba(95,224,184,.08)', boxLine: 'rgba(95,224,184,.25)' },
  FAILED: { tint: '#F87171', ring: 'rgba(248,113,113,.18)', fg: '#F4A3A3', grad: ['#46506F', '#262D47'], box: 'rgba(248,113,113,.07)', boxLine: 'rgba(248,113,113,.25)' },
};

function Emblem({ outcome }: { outcome: Outcome }) {
  const l = LOOK[outcome];
  const p = { stroke: l.fg, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: l.grad[1], alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: l.ring, zIndex: 2 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 48, backgroundColor: l.grad[0], opacity: 0.55, borderTopLeftRadius: 48, borderTopRightRadius: 48 }} />
      <Svg width={50} height={50} viewBox="0 0 24 24">
        {outcome === 'WON' ? (<><Path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" {...p} /><Path d="M8 6H5a1 1 0 0 0-1 1c0 2.2 1.6 4 4 4" {...p} /><Path d="M16 6h3a1 1 0 0 1 1 1c0 2.2-1.6 4-4 4" {...p} /><Path d="M12 13v4M8.5 20h7M10 17h4v3h-4z" {...p} /></>)
          : outcome === 'LOST' || outcome === 'FAILED' ? (<><Path d="M12 3 4.5 6v5.5c0 4.4 3 7.6 7.5 9.5 4.5-1.9 7.5-5.1 7.5-9.5V6L12 3Z" {...p} /><Path d="m9.5 9.5 5 5M14.5 9.5l-5 5" {...p} /></>)
          : outcome === 'DRAW' ? (<><Path d="M5 9h14M5 15h14" {...p} /></>)
          : outcome === 'SOLVED' ? (<Path d="m5 12.5 4.5 4.5L19 7.5" {...p} />)
          : (<><Path d="M5 21V4" {...p} /><Path d="M5 4h13l-2.5 4.5L18 13H5" {...p} /></>)}
      </Svg>
    </View>
  );
}

function CoinIcon({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} fill="#FFC83D" />
      <Circle cx={12} cy={12} r={7} fill="none" stroke="#B87A00" strokeWidth={1.4} />
    </Svg>
  );
}

const num = (n: number) => Math.abs(n).toLocaleString();

export function ResultModal(props: ResultModalProps) {
  const { outcome, title, subtitle, coin, standings, chips, nextUp, banner, balance, primary, secondary, delayMs = 800 } = props;
  const [ready, setReady] = useState(delayMs === 0);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), delayMs); return () => clearTimeout(t); }, [delayMs]);
  const l = LOOK[outcome];

  if (!ready) return null;
  if (hidden) {
    // The player chose to look at the final board; one small pill brings the card back.
    return (
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center' }}>
        <Pressable onPress={() => setHidden(false)} style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22, backgroundColor: '#151A33', borderWidth: 1, borderColor: l.tint }}>
          <Text style={{ color: l.tint, fontWeight: '800' }}>{title} · show result</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent onRequestClose={() => setHidden(true)} supportedOrientations={['portrait', 'landscape']}>
      <View style={{ flex: 1, backgroundColor: 'rgba(6,9,22,.78)', justifyContent: 'center' }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center' }}>
            <Emblem outcome={outcome} />
            <View style={{ alignSelf: 'stretch', marginTop: -48, paddingTop: 62, paddingHorizontal: 20, paddingBottom: 20, borderRadius: 28, backgroundColor: '#151A33', borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', gap: 14, alignItems: 'center' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: l.tint, fontWeight: '900', fontSize: 34, letterSpacing: 3 }} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
                <Text style={{ marginTop: 8, color: '#A8B0D6', fontWeight: '600', fontSize: 14, textAlign: 'center' }}>{subtitle}</Text>
              </View>

              {coin ? (
                <View style={{ alignSelf: 'stretch', borderRadius: 18, backgroundColor: l.box, borderWidth: 1, borderColor: l.boxLine, padding: 14, alignItems: 'center', gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <CoinIcon />
                    <Text style={{ fontWeight: '900', fontSize: 42, color: coin.delta > 0 ? '#FFD25A' : coin.delta < 0 ? '#F87171' : '#E6E9FF' }}>{coin.delta > 0 ? '+' : coin.delta < 0 ? '−' : '±'}{num(coin.delta)}</Text>
                  </View>
                  {coin.pot ? (
                    <View style={{ alignSelf: 'stretch', gap: 5 }}>
                      <Row left={coin.potLabel ?? 'Prize pot'} right={num(coin.pot)} />
                      {coin.houseFee ? <Row left="House fee" right={`−${num(coin.houseFee)}`} /> : null}
                      {coin.net !== undefined ? <Row left="Net after your stake" right={`${coin.net >= 0 ? '+' : '−'}${num(coin.net)}`} strong good={coin.net >= 0} /> : null}
                    </View>
                  ) : <Text style={{ color: '#A8B0D6', fontWeight: '600', fontSize: 13 }}>{coin.note}</Text>}
                </View>
              ) : null}

              {nextUp ? (
                <View style={{ alignSelf: 'stretch', borderRadius: 14, backgroundColor: l.box, borderWidth: 1, borderColor: l.boxLine, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#A8B0D6', fontWeight: '600', fontSize: 13 }}>Next up</Text>
                  <Text style={{ color: '#E6E9FF', fontWeight: '800', fontSize: 13 }}>{nextUp}</Text>
                </View>
              ) : null}

              {standings && standings.length > 1 ? (
                <View style={{ alignSelf: 'stretch', gap: 6 }}>
                  {standings.map((s) => (
                    <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 12, backgroundColor: s.winner ? 'rgba(255,210,90,.12)' : s.me ? 'rgba(255,255,255,.07)' : 'transparent', borderWidth: s.winner || s.me ? 1 : 0, borderColor: s.winner ? 'rgba(255,210,90,.35)' : 'rgba(255,255,255,.14)' }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: s.winner ? '#FFD25A' : 'rgba(255,255,255,.12)' }}>
                        <Text style={{ fontWeight: '800', fontSize: 12, color: s.winner ? '#3B2A00' : colors.text }}>{s.place ?? '–'}</Text>
                      </View>
                      <Text style={{ flex: 1, color: colors.text, fontWeight: s.me || s.winner ? '800' : '600', fontSize: 14 }} numberOfLines={1}>{s.me ? 'You' : s.name}</Text>
                      <Text style={{ color: s.winner ? '#FFD25A' : '#A8B0D6', fontWeight: '700', fontSize: 13 }}>{s.right}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {chips && chips.length ? (
                <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 8 }}>
                  {chips.map((c) => (
                    <View key={c.label} style={{ flex: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.06)', paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center' }}>
                      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }} numberOfLines={1} adjustsFontSizeToFit>{c.value}</Text>
                      <Text style={{ color: '#A8B0D6', fontWeight: '600', fontSize: 11 }}>{c.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {banner ? <Text style={{ color: '#FFD25A', fontWeight: '800', fontSize: 14 }}>{banner}</Text> : null}

              <View style={{ alignSelf: 'stretch', gap: 8 }}>
                <Button title={primary.title} onPress={primary.onPress} busy={primary.busy} style={{ height: 52, borderRadius: 16, backgroundColor: '#6B4BFF', borderColor: '#6B4BFF' }} />
                <Button title={secondary.title} kind="ghost" onPress={secondary.onPress} style={{ height: 48, borderRadius: 16 }} />
              </View>

              <Pressable onPress={() => setHidden(true)} hitSlop={10}><Text style={{ color: '#8D96BF', fontWeight: '700', fontSize: 12 }}>View board</Text></Pressable>
              {balance !== null && balance !== undefined ? <Text style={{ color: '#8D96BF', fontWeight: '600', fontSize: 12 }}>Balance {balance.toLocaleString()} coins</Text> : null}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({ left, right, strong, good }: { left: string; right: string; strong?: boolean; good?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: strong ? 6 : 0, borderTopWidth: strong ? 1 : 0, borderTopColor: 'rgba(255,255,255,.1)' }}>
      <Text style={{ color: '#A8B0D6', fontWeight: '600', fontSize: 13 }}>{left}</Text>
      <Text style={{ color: strong ? (good ? '#4ADE9A' : '#F87171') : colors.text, fontWeight: strong ? '800' : '600', fontSize: 13 }}>{right}</Text>
    </View>
  );
}
