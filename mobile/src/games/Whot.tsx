import * as ScreenOrientation from 'expo-screen-orientation';
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { Match } from '../types';
import { Avatar } from '../ui';

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
/** The reference game prints every shape in one deep red on white cards. */
const RED = '#9B1B1B';
const SHAPE_COLOR = [RED, RED, RED, RED, RED];
const POWER: Record<number, string> = { 1: 'HOLD ON', 2: 'PICK TWO', 14: 'MARKET' };

const starPoints = (cx: number, cy: number, outer: number, inner: number) =>
  Array.from({ length: 10 }, (_, i) => { const r = i % 2 === 0 ? outer : inner; const a = -Math.PI / 2 + (i * Math.PI) / 5; return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`; }).join(' ');

/** The shape on a card, drawn in a 20x20 box. */
function Shape({ s, size, n }: { s: number; size: number; n?: number }) {
  const c = SHAPE_COLOR[s];
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      {s === 0 ? <Circle cx={10} cy={10} r={8} fill={c} /> : null}
      {s === 1 ? <Polygon points="10,2 18.5,17 1.5,17" fill={c} /> : null}
      {s === 2 ? <Polygon points="7.5,1.5 12.5,1.5 12.5,7.5 18.5,7.5 18.5,12.5 12.5,12.5 12.5,18.5 7.5,18.5 7.5,12.5 1.5,12.5 1.5,7.5 7.5,7.5" fill={c} /> : null}
      {s === 3 ? <Rect x={2.5} y={2.5} width={15} height={15} rx={1.5} fill={c} /> : null}
      {s === 4 ? <Polygon points={starPoints(10, 10.5, 9, 3.8)} fill={c} /> : null}
      {s === 4 && n !== undefined ? <SvgText x={10} y={12.6} fontSize={6} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">{n}</SvgText> : null}
    </Svg>
  );
}

export const CardFace = memo(function CardFace({ card, w, lit = true, lift = 0 }: { card: Card; w: number; lit?: boolean; lift?: number }) {
  const h = w * 1.45;
  const color = SHAPE_COLOR[card.s];
  return (
    <View style={{ width: w, height: h, borderRadius: w * 0.14, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: lit ? '#D8D8D8' : '#9AA0B5', opacity: lit ? 1 : 0.6, padding: w * 0.07, justifyContent: 'space-between', transform: [{ translateY: -lift }], shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: lit ? 4 : 1 }}>
      <Text style={{ color, fontWeight: '900', fontSize: w * 0.3, lineHeight: w * 0.32 }}>{card.n}</Text>
      <View style={{ alignItems: 'center' }}>
        <Shape s={card.s} size={w * 0.52} n={card.n} />
        {POWER[card.n] ? <Text style={{ color, fontSize: w * 0.115, fontWeight: '900', marginTop: 2 }}>{POWER[card.n]}</Text> : null}
      </View>
      <Text style={{ color, fontWeight: '900', fontSize: w * 0.3, lineHeight: w * 0.32, alignSelf: 'flex-end', transform: [{ rotate: '180deg' }] }}>{card.n}</Text>
    </View>
  );
});

export function CardBack({ w, label }: { w: number; label?: string | number }) {
  return (
    <View style={{ width: w, height: w * 1.45, borderRadius: w * 0.08, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#D8D8D8', padding: w * 0.04, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, elevation: 3 }}>
      <View style={{ flex: 1, borderRadius: w * 0.06, backgroundColor: '#A32020', borderWidth: 1.5, borderColor: '#7A1010', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: w * 0.06, right: w * 0.06, top: w * 0.06, bottom: w * 0.06, borderRadius: w * 0.04, borderWidth: 1, borderColor: 'rgba(255,255,255,.55)' }} />
        <View style={{ width: w * 0.5, height: w * 0.5, borderRadius: w * 0.25, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.6)' }} />
        <Text style={{ position: 'absolute', bottom: w * 0.12, color: '#FFFFFF', fontWeight: '900', fontStyle: 'italic', fontSize: w * 0.19 }}>Whot</Text>
        {label !== undefined ? <Text style={{ position: 'absolute', color: '#FFE600', fontWeight: '900', fontSize: w * 0.3, textShadowColor: '#000', textShadowRadius: 3 }}>{label}</Text> : null}
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
                <View style={{ width: 22, height: 31, borderRadius: 4, backgroundColor: '#A32020', borderWidth: 1.5, borderColor: '#FFFFFF' }} />
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


const HINT = 'Card must be of the same shape or number as the card on the played deck.';
const WOOD = '#B5651D';

/** An opponent's hand drawn face down, with their avatar and card count over the middle card (as in the reference game). */
function OpponentHand({ name, count, cardW, turn, left, note }: { name: string; count: number; cardW: number; turn: boolean; left: boolean; note?: string }) {
  const shown = Math.min(count, 9);
  const step = shown > 5 ? cardW * 0.62 : cardW * 1.08;
  const width = shown === 0 ? cardW : step * (shown - 1) + cardW;
  return (
    <View style={{ alignItems: 'center', opacity: left ? 0.35 : 1 }}>
      <View style={{ width, height: cardW * 1.45 }}>
        {Array.from({ length: shown }, (_, i) => <View key={i} style={{ position: 'absolute', left: i * step, top: 0 }}><CardBack w={cardW} /></View>)}
        <View style={{ position: 'absolute', left: width / 2 - 20, top: 0, alignItems: 'center' }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: turn ? '#FFE600' : '#F2D200', backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <Avatar name={name} size={34} />
          </View>
          <View style={{ position: 'absolute', top: -7, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#FFE600', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: '#222', fontWeight: '900', fontSize: 11 }}>{left ? '–' : count}</Text>
          </View>
          <Text numberOfLines={1} style={{ color: '#3DE0FF', fontWeight: '900', fontSize: 11, maxWidth: 80, textShadowColor: '#000', textShadowRadius: 3 }}>{name}</Text>
        </View>
      </View>
      {note ? <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14, marginTop: 4, textShadowColor: '#000', textShadowRadius: 4 }}>{note}</Text> : null}
    </View>
  );
}

/**
 * The game while it is on: a landscape wooden table like the reference Whot game. Opponents' hands face down along the top,
 * the draw pile (with the number of cards left) on the left, the card in play on the right, and your hand along the bottom.
 */
export function WhotTable({ match, mySeat, onMove, busy, onResign }: { match: Match<State>; mySeat: number; onMove: (move: object) => void; busy: boolean; onResign: () => void }) {
  const s = match.state;
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hidden, setHidden] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rules, setRules] = useState(false);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    return () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined); if (hintTimer.current) clearTimeout(hintTimer.current); };
  }, []);

  const active = match.status === 'ACTIVE';
  const myTurn = active && s.turn === mySeat && !busy;
  const hand = s.hand ?? [];
  const canPlay = s.canPlay ?? [];
  const nameOf = (seat: number) => (seat === mySeat ? 'You' : match.players.find((p) => p.seat === seat)?.displayName ?? 'Player');
  const others = match.players.filter((p) => p.seat !== mySeat).sort((a, b) => a.seat - b.seat);

  // Size the cards from the room there is: the table is short, so everything is built from its height.
  const H = size.h || 360, W = size.w || 720;
  const handW = Math.max(52, Math.min(92, H * 0.24, (W - 120) / Math.max(5.2, hand.length * 1.12)));
  const oppW = Math.max(34, Math.min(62, H * 0.15, (W - 120) / (others.length * 6.5)));
  const pileW = Math.max(56, Math.min(92, H * 0.23));

  const pop = useRef(new Animated.Value(1)).current;
  const seen = useRef(s.moves);
  useEffect(() => {
    if (seen.current === s.moves) return;
    seen.current = s.moves;
    pop.setValue(0.8);
    Animated.timing(pop, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
  }, [s.moves, pop]);

  const facing = s.pending > 0 && s.turn === mySeat;
  const last = s.last;
  const noteFor = (seat: number) => (last && last.seat === seat && (last.kind === 'draw' || last.kind === 'pick') ? 'Go market' : last && last.seat === seat && last.kind === 'market' ? 'General Market!' : undefined);
  const centre = !active ? 'Game over' : myTurn ? (facing ? `Defend with a 2 or pick up ${s.pending}` : s.canDraw ? 'Go to market' : 'Your turn') : `${nameOf(s.turn)}'s turn`;

  const showHint = (text: string) => {
    setHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2600);
  };
  const tap = (i: number) => {
    if (!active || busy) return;
    if (s.turn !== mySeat) { showHint("It is not your turn yet."); return; }
    if (!canPlay.includes(i)) { showHint(facing ? 'Only a 2 can answer a Pick Two. Play a 2, or pick up the cards.' : HINT); return; }
    onMove({ action: 'play', card: i });
  };
  const pileTap = () => {
    if (!active || busy) return;
    if (s.turn !== mySeat) { showHint('It is not your turn yet.'); return; }
    if (!s.canDraw) { showHint('You have a card you can play.'); return; }
    onMove({ action: 'draw' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: WOOD }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* wood grain */}
      {[0.08, 0.19, 0.31, 0.44, 0.57, 0.69, 0.82, 0.93].map((t, i) => <View key={i} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: `${t * 100}%`, height: 2 + (i % 3), backgroundColor: i % 2 ? 'rgba(90,40,5,.14)' : 'rgba(255,200,120,.09)' }} />)}

      {/* opponents along the top */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 6, left: Math.max(insets.left, 70), right: Math.max(insets.right, 70), flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' }}>
        {others.map((p) => <OpponentHand key={p.userId} name={p.displayName} count={s.counts[p.seat]} cardW={oppW} turn={active && s.turn === p.seat} left={p.left} note={noteFor(p.seat)} />)}
      </View>

      {/* the middle: draw pile, message, card in play */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: Math.max(insets.left, 70), right: Math.max(insets.right, 70), top: H * 0.36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={pileTap} hitSlop={8}>
          <View>
            {myTurn && s.canDraw ? <View pointerEvents="none" style={{ position: 'absolute', left: -5, top: -5, right: -5, bottom: -5, borderRadius: 10, borderWidth: 3, borderColor: '#FFE600' }} /> : null}
            <CardBack w={pileW} label={s.drawCount} />
          </View>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 20, textAlign: 'center', textShadowColor: '#000', textShadowRadius: 5 }}>{centre}</Text>
          {s.pending > 0 ? <Text style={{ color: '#FFE600', fontWeight: '900', fontSize: 14, textShadowColor: '#000', textShadowRadius: 4 }}>Pick {s.pending} pending</Text> : null}
        </View>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <CardFace card={s.top} w={pileW} />
          {facing ? <View style={{ position: 'absolute', left: 0, right: 0, top: pileW * 0.5, alignItems: 'center' }}><Text style={{ backgroundColor: '#1B8F3A', color: '#fff', fontWeight: '900', fontSize: 15, paddingHorizontal: 12, paddingVertical: 3, borderRadius: 3, overflow: 'hidden' }}>Defend</Text></View> : null}
        </Animated.View>
      </View>

      {/* my hand along the bottom */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ position: 'absolute', left: Math.max(insets.left, 70), right: Math.max(insets.right, 70), bottom: 4, height: handW * 1.45 + 18 }} contentContainerStyle={{ gap: handW * 0.06, alignItems: 'flex-end', justifyContent: 'center', minWidth: '100%', paddingTop: 14 }}>
        {hand.map((c, i) => {
          const ok = myTurn && canPlay.includes(i);
          return (
            <Pressable key={`${c.s}-${c.n}`} onPress={() => tap(i)} hitSlop={3}>
              {hidden ? <CardBack w={handW} /> : <CardFace card={c} w={handW} lit lift={ok ? 12 : 0} />}
            </Pressable>
          );
        })}
      </ScrollView>
      {/* my avatar and card count sit on the middle card, as in the reference */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: handW * 0.55, alignItems: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: '#F2D200', backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Avatar name={nameOf(mySeat) === 'You' ? 'Me' : nameOf(mySeat)} size={34} />
        </View>
        <View style={{ position: 'absolute', top: -7, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#FFE600', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: '#222', fontWeight: '900', fontSize: 11 }}>{hand.length}</Text>
        </View>
        <Text style={{ color: '#3DE0FF', fontWeight: '900', fontSize: 11, textShadowColor: '#000', textShadowRadius: 3 }}>Me</Text>
      </View>

      {hint ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(insets.left, 70), bottom: handW * 1.45 + 24, maxWidth: W * 0.55, backgroundColor: '#1233B8', paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{hint}</Text>
        </View>
      ) : null}

      {/* corner buttons */}
      <Pressable onPress={() => setRules(true)} style={{ position: 'absolute', left: Math.max(insets.left, 10), top: 8, width: 38, height: 38, borderRadius: 19, backgroundColor: '#1E9BE0', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>≡</Text></Pressable>
      <Pressable onPress={onResign} style={{ position: 'absolute', right: Math.max(insets.right, 10), top: 8, width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8650A', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>✕</Text></Pressable>
      <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(insets.left, 10), bottom: 8 }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, textShadowColor: '#000', textShadowRadius: 3 }}>{match.pot > 0 ? `Pot: ${match.pot.toLocaleString()} 🪙` : 'Friendly'}</Text>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, textShadowColor: '#000', textShadowRadius: 3 }}>{s.drawCount + s.discardCount - 1} in pile</Text>
      </View>
      <Pressable onPress={() => setHidden((h) => !h)} style={{ position: 'absolute', right: Math.max(insets.right, 8), bottom: 8, width: 62, height: 62, borderRadius: 31, borderWidth: 4, borderColor: '#F2C200', backgroundColor: '#1E9BE0', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{hidden ? '👁' : '↻'}</Text>
        <Text style={{ position: 'absolute', top: -14, color: '#fff', fontSize: 8, fontWeight: '900', width: 76, textAlign: 'center', textShadowColor: '#000', textShadowRadius: 3 }}>{hidden ? 'SHOW MY CARDS' : 'HIDE MY CARDS'}</Text>
      </Pressable>

      {rules ? (
        <Pressable onPress={() => setRules(false)} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 10, padding: 16, maxWidth: 560, gap: 6 }}>
            <Text style={{ color: RED, fontWeight: '900', fontSize: 18 }}>How to play Whot</Text>
            <Text style={{ color: '#222', fontSize: 14 }}>• Play a card with the same shape or number as the card showing. Cannot play? Tap the pile to take one.</Text>
            <Text style={{ color: '#222', fontSize: 14 }}>• 1 Hold On: play again. 2 Pick Two: the next player picks 2 and misses their turn, unless they defend with a 2 and it stacks. 14 General Market: everyone else picks 1 and you play again.</Text>
            <Text style={{ color: '#222', fontSize: 14 }}>• First to empty their hand wins. Tap anywhere to close.</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
