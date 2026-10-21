import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Polygon, Rect } from 'react-native-svg';
import { Match } from '../types';

interface Card { s: number; n: number }
type Last =
  | { seat: number; kind: 'play'; card: Card }
  | { seat: number; kind: 'draw'; count: number }
  | { seat: number; kind: 'pick'; count: number }
  | { seat: number; kind: 'market'; card: Card; count: number }
  | { seat: number; kind: 'pass' };
interface State {
  players: number; top: Card; turn: number; pending: number; counts: number[]; drawCount: number; discardCount: number;
  left: number[]; moves: number; last: Last | null;
  seat?: number; hand?: Card[]; canPlay?: number[]; canDraw?: boolean;
}

const SHAPE_NAME = ['circle', 'triangle', 'cross', 'square', 'star'];
const SHAPE_COLOR = ['#D32F2F', '#2E7D32', '#6A1B9A', '#1565C0', '#EF6C00'];
const POWER: Record<number, string> = { 1: 'HOLD ON', 2: 'PICK TWO', 14: 'MARKET' };

const starPoints = (cx: number, cy: number, outer: number, inner: number) =>
  Array.from({ length: 10 }, (_, i) => { const r = i % 2 === 0 ? outer : inner; const a = -Math.PI / 2 + (i * Math.PI) / 5; return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`; }).join(' ');

/** The shape on a card, drawn in a 20x20 box. */
function Shape({ s, size }: { s: number; size: number }) {
  const c = SHAPE_COLOR[s];
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      {s === 0 ? <Circle cx={10} cy={10} r={8} fill={c} /> : null}
      {s === 1 ? <Polygon points="10,2 18.5,17 1.5,17" fill={c} /> : null}
      {s === 2 ? <Polygon points="7.5,1.5 12.5,1.5 12.5,7.5 18.5,7.5 18.5,12.5 12.5,12.5 12.5,18.5 7.5,18.5 7.5,12.5 1.5,12.5 1.5,7.5 7.5,7.5" fill={c} /> : null}
      {s === 3 ? <Rect x={2.5} y={2.5} width={15} height={15} rx={1.5} fill={c} /> : null}
      {s === 4 ? <Polygon points={starPoints(10, 10.5, 9, 3.8)} fill={c} /> : null}
    </Svg>
  );
}

export const CardFace = memo(function CardFace({ card, w, lit = true, lift = 0 }: { card: Card; w: number; lit?: boolean; lift?: number }) {
  const h = w * 1.45;
  const color = SHAPE_COLOR[card.s];
  return (
    <View style={{ width: w, height: h, borderRadius: w * 0.14, backgroundColor: '#FFFFFF', borderWidth: 2.5, borderColor: lit ? color : '#9AA0B5', opacity: lit ? 1 : 0.5, padding: w * 0.07, justifyContent: 'space-between', transform: [{ translateY: -lift }], shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: lit ? 4 : 1 }}>
      <Text style={{ color, fontWeight: '900', fontSize: w * 0.3, lineHeight: w * 0.32 }}>{card.n}</Text>
      <View style={{ alignItems: 'center' }}>
        <Shape s={card.s} size={w * 0.52} />
        {POWER[card.n] ? <Text style={{ color, fontSize: w * 0.115, fontWeight: '900', marginTop: 2 }}>{POWER[card.n]}</Text> : null}
      </View>
      <Text style={{ color, fontWeight: '900', fontSize: w * 0.3, lineHeight: w * 0.32, alignSelf: 'flex-end', transform: [{ rotate: '180deg' }] }}>{card.n}</Text>
    </View>
  );
});

export function CardBack({ w }: { w: number }) {
  return (
    <View style={{ width: w, height: w * 1.45, borderRadius: w * 0.14, backgroundColor: '#2A1F5C', borderWidth: 2.5, borderColor: '#7C5CFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 }}>
      <View style={{ width: w * 0.62, height: w * 1.05, borderRadius: w * 0.1, borderWidth: 2, borderColor: 'rgba(255,255,255,.35)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFD21F', fontWeight: '900', fontSize: w * 0.2, fontStyle: 'italic' }}>WHOT</Text>
      </View>
    </View>
  );
}

const cardName = (c: Card) => `${c.n} ${SHAPE_NAME[c.s]}`;

/** What just happened, in words. */
function describe(last: Last | null, nameOf: (seat: number) => string): string {
  if (!last) return '';
  const who = nameOf(last.seat);
  switch (last.kind) {
    case 'play': return `${who} played ${cardName(last.card)}${last.card.n === 1 ? ': Hold On, plays again' : last.card.n === 2 ? ': Pick Two!' : ''}`;
    case 'market': return `${who} played 14: General Market! Everyone else picked ${last.count}`;
    case 'pick': return `${who} picked up ${last.count} cards`;
    case 'draw': return `${who} took a card`;
    case 'pass': return `${who} had nothing to play or draw`;
  }
}

export function Whot({ match, mySeat, onMove, busy, height }: { match: Match<State>; mySeat: number; onMove: (move: object) => void; busy: boolean; height: number }) {
  const s = match.state;
  const active = match.status === 'ACTIVE';
  const myTurn = active && s.turn === mySeat && !busy;
  const hand = s.hand ?? [];
  const canPlay = s.canPlay ?? [];
  const nameOf = (seat: number) => (seat === mySeat ? 'You' : match.players.find((p) => p.seat === seat)?.displayName ?? 'Player');
  const compact = height < 520;
  const cardW = compact ? 56 : 66;
  const topW = compact ? 78 : 96;
  const others = match.players.filter((p) => p.seat !== mySeat);

  const pop = useRef(new Animated.Value(1)).current;
  const seen = useRef(s.moves);
  useEffect(() => {
    if (seen.current === s.moves) return;
    seen.current = s.moves;
    pop.setValue(0.82);
    Animated.timing(pop, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
  }, [s.moves, pop]);

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const facing = s.pending > 0 && s.turn === mySeat;
  const message = !active ? 'Game over'
    : myTurn ? (facing ? `Pick Two! Play a 2 or tap the pile to pick up ${s.pending}` : s.canDraw ? 'Nothing to play: tap the pile to take a card' : 'Your turn: tap a glowing card')
      : `${nameOf(s.turn)}'s turn${s.pending > 0 ? ` (facing ${s.pending})` : ''}`;
  const event = describe(s.last, nameOf);
  const lastCardSeats = s.counts.map((n, i) => ({ n, i })).filter((x) => x.n === 1 && !s.left.includes(x.i));

  return (
    <View style={{ flex: 1, justifyContent: 'space-between', paddingVertical: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
        {others.map((p) => {
          const turn = active && s.turn === p.seat;
          return (
            <View key={p.userId} style={{ alignItems: 'center', minWidth: 78, padding: 6, borderRadius: 12, borderWidth: 2, borderColor: turn ? '#FFD21F' : 'rgba(255,255,255,.12)', backgroundColor: 'rgba(255,255,255,.05)', opacity: p.left ? 0.35 : 1 }}>
              <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '800', fontSize: 12, maxWidth: 96 }}>{p.displayName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <View style={{ width: 22, height: 31, borderRadius: 4, backgroundColor: '#2A1F5C', borderWidth: 1.5, borderColor: '#7C5CFF' }} />
                <Text style={{ color: '#FFD21F', fontWeight: '900', fontSize: 18 }}>{p.left ? '–' : s.counts[p.seat]}</Text>
              </View>
              {!p.left && s.counts[p.seat] === 1 ? <Text style={{ color: '#FF5A5A', fontWeight: '900', fontSize: 10, marginTop: 2 }}>LAST CARD!</Text> : null}
            </View>
          );
        })}
      </View>

      <View style={{ alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 26 }}>
          <Pressable disabled={!myTurn || !s.canDraw} onPress={() => onMove({ action: 'draw' })} hitSlop={8} style={{ alignItems: 'center' }}>
            <View>
              {myTurn && s.canDraw ? <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -6, top: -6, right: -6, bottom: -6, borderRadius: 14, borderWidth: 3, borderColor: '#FFD21F', opacity: pulse }} /> : null}
              <CardBack w={topW * 0.8} />
            </View>
            <Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 11, marginTop: 4, fontWeight: '700' }}>{s.drawCount > 0 ? `${s.drawCount} left` : 'empty'}</Text>
          </Pressable>
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <CardFace card={s.top} w={topW} />
          </Animated.View>
        </View>
        {s.pending > 0 ? <Text style={{ color: '#FFD21F', fontWeight: '900', fontSize: 14 }}>⚠ Pick {s.pending} pending</Text> : null}
        <Text style={{ color: myTurn ? '#FFD21F' : 'rgba(255,255,255,.8)', fontWeight: '900', fontSize: 14, textAlign: 'center', paddingHorizontal: 12 }}>{message}</Text>
        <Text style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, textAlign: 'center', minHeight: 16 }}>{event}</Text>
        {lastCardSeats.some((x) => x.i === mySeat) ? <Text style={{ color: '#FF5A5A', fontWeight: '900' }}>LAST CARD!</Text> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 22, paddingBottom: 6, gap: 8, alignItems: 'flex-end', minWidth: '100%', justifyContent: 'center' }}>
        {hand.map((c, i) => {
          const ok = myTurn && canPlay.includes(i);
          return (
            <Pressable key={`${c.s}-${c.n}`} disabled={!ok} onPress={() => onMove({ action: 'play', card: i })} hitSlop={4}>
              <CardFace card={c} w={cardW} lit={!myTurn || ok} lift={ok ? 14 : 0} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
