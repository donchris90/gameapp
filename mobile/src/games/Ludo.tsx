import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Polygon, Rect } from 'react-native-svg';
import { Match } from '../types';
import { sfx } from '../sfx';

const STEP_MS = 120;
const STARS = [8, 21, 34, 47];
const STARTS = [0, 13, 26, 39];
const starPoints = (cx: number, cy: number, outer: number, inner: number) => Array.from({ length: 10 }, (_, i) => { const r = i % 2 === 0 ? outer : inner; const a = -Math.PI / 2 + (i * Math.PI) / 5; return `${(cx + r * Math.cos(a)).toFixed(3)},${(cy + r * Math.sin(a)).toFixed(3)}`; }).join(' ');

interface State {
  rolls?: number; moves: number;
  tokens: number[][]; turn: number; phase: 'ROLL' | 'MOVE'; dice: number | null; canMove: number[];
  lastRoll: { seat: number; value: number; skipped?: string } | null; home: number[]; ring: number;
  last: { seat: number; token: number; captured: Array<{ seat: number; token: number }> } | null;
}

// Clockwise ring of 52 squares as [row, col] on a 15x15 board. Ring index 0 is where board position 0 starts.
const RING: Array<[number, number]> = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
];
const POSITION = [0, 2, 1, 3]; // seat -> place on the board, so two players face each other
const HOME_COL: Array<(k: number) => [number, number]> = [(k) => [7, 1 + k], (k) => [1 + k, 7], (k) => [7, 13 - k], (k) => [13 - k, 7]];
const YARD_ORIGIN: Array<[number, number]> = [[0, 0], [0, 9], [9, 9], [9, 0]];
// Colours from the reference Ludo board.
const COLORS = ['#E53935', '#2EAD4B', '#F9B900', '#1E7BE0'];
const DARK = ['#A3211E', '#1B7A32', '#B98400', '#1257A6'];
const SAFE = new Set([0, 13, 26, 39, 8, 21, 34, 47]);
const FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Where a token is drawn, in board cells (can be fractional). */
function cellOf(seat: number, token: number, p: number): [number, number] {
  const pos = POSITION[seat];
  if (p < 0) { const [r, c] = YARD_ORIGIN[pos]; return [r + (token < 2 ? 1.5 : 3.5), c + (token % 2 === 0 ? 1.5 : 3.5)]; }
  if (p <= 50) return RING[(13 * pos + p) % 52];
  if (p <= 55) return HOME_COL[pos](p - 51);
  const base: Array<[number, number]> = [[7, 6.2], [6.2, 7], [7, 7.8], [7.8, 7]];
  return [base[pos][0] + token * 0.1 - 0.15, base[pos][1] + token * 0.1 - 0.15];
}


/** The board artwork drawn like the reference app: coloured yards, rounded squares, stars, four-colour centre. */
const BoardArt = memo(function BoardArt({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 15 15" pointerEvents="none">
      <Rect x={0} y={0} width={15} height={15} fill="#FFFFFF" />
      {YARD_ORIGIN.map(([r, c], pos) => (
        <G key={pos}>
          <Rect x={c} y={r} width={6} height={6} fill={COLORS[pos]} />
          <Rect x={c + 1} y={r + 1} width={4} height={4} rx={0.8} fill="#FFFFFF" fillOpacity={0.93} />
          {[0, 1, 2, 3].map((k) => <Circle key={k} cx={c + 2 + (k % 2) * 2} cy={r + 2 + Math.floor(k / 2) * 2} r={0.64} fill={COLORS[pos]} fillOpacity={0.2} stroke={COLORS[pos]} strokeOpacity={0.55} strokeWidth={0.07} />)}
        </G>
      ))}
      {RING.map(([r, c], i) => {
        const st = STARTS.indexOf(i);
        return <Rect key={i} x={c + 0.02} y={r + 0.02} width={0.96} height={0.96} rx={0.12} fill={st >= 0 ? COLORS[POSITION[0] === 0 ? st : st] : '#FFFFFF'} stroke="#CDD3E0" strokeWidth={0.05} />;
      })}
      {[0, 1, 2, 3].flatMap((pos) => Array.from({ length: 5 }, (_, k) => {
        const [r, c] = HOME_COL[pos](k);
        return <Rect key={`${pos}${k}`} x={c + 0.02} y={r + 0.02} width={0.96} height={0.96} rx={0.12} fill={COLORS[pos]} fillOpacity={0.9} stroke={DARK[pos]} strokeOpacity={0.5} strokeWidth={0.05} />;
      }))}
      {STARS.map((i) => <Polygon key={`s${i}`} points={starPoints(RING[i][1] + 0.5, RING[i][0] + 0.5, 0.36, 0.15)} fill="#B4BBC9" />)}
      {STARTS.map((i) => <Polygon key={`t${i}`} points={starPoints(RING[i][1] + 0.5, RING[i][0] + 0.5, 0.34, 0.14)} fill="#FFFFFF" />)}
      <Polygon points="6,6 7.5,7.5 6,9" fill={COLORS[0]} />
      <Polygon points="6,6 9,6 7.5,7.5" fill={COLORS[1]} />
      <Polygon points="9,6 9,9 7.5,7.5" fill={COLORS[2]} />
      <Polygon points="6,9 9,9 7.5,7.5" fill={COLORS[3]} />
      <Rect x={6} y={6} width={3} height={3} fill="none" stroke="#FFFFFF" strokeWidth={0.06} />
      <Circle cx={7.5} cy={7.5} r={0.3} fill="#FFFFFF" />
    </Svg>
  );
});

const STACK = [[0, 0, 1], [-0.2, 0, 0.72], [0.2, 0, 0.72], [-0.2, 0.16, 0.62], [0.2, 0.16, 0.62], [0, -0.2, 0.62]];

/** A pawn that walks square by square when its progress changes. */
const Pawn = memo(function Pawn({ seat, token, progress, u, offset, count, selectable, pulse, onPress }: { seat: number; token: number; progress: number; u: number; offset: number; count: number; selectable: boolean; pulse: Animated.Value; onPress: () => void }) {
  const size = u * 0.8;
  const slot = count <= 1 ? [0, 0, 1] : count === 2 ? STACK[1 + offset] : STACK[3 + (offset % 3)];
  const px = (p: number) => { const [r, c] = cellOf(seat, token, p); return { x: (c + 0.5 + slot[0]) * u - size / 2, y: (r + 0.5 + slot[1]) * u - size / 2 }; };
  const pos = useRef(new Animated.ValueXY(px(progress))).current;
  const prev = useRef(progress);
  useEffect(() => {
    const from = prev.current; prev.current = progress;
    const steps: Animated.CompositeAnimation[] = [];
    if (from >= 0 && progress > from && progress - from <= 12) for (let p = from + 1; p <= progress; p++) steps.push(Animated.timing(pos, { toValue: px(p), duration: STEP_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    else steps.push(Animated.timing(pos, { toValue: px(progress), duration: from !== progress ? 380 : 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
    const seq = Animated.sequence(steps); seq.start();
    return () => seq.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, u, offset, count]);
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.3] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 0.15] });
  const base = COLORS[POSITION[seat]], dark = DARK[POSITION[seat]];
  return (
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, zIndex: selectable ? 40 : 10, transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale: slot[2] }] }}>
      {selectable ? <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -size * 0.2, top: -size * 0.2, width: size * 1.4, height: size * 1.4, borderRadius: size, borderWidth: 2.5, borderColor: '#FFFFFF', backgroundColor: `${base}66`, opacity: ringOpacity, transform: [{ scale: ringScale }] }} /> : null}
      <Pressable disabled={!selectable} onPress={onPress} hitSlop={10}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: base, borderWidth: Math.max(2, size * 0.1), borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
          <View style={{ width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21, backgroundColor: dark, opacity: 0.55 }} />
          <View style={{ position: 'absolute', top: size * 0.1, left: size * 0.16, width: size * 0.3, height: size * 0.18, borderRadius: size * 0.1, backgroundColor: 'rgba(255,255,255,0.5)' }} />
        </View>
      </Pressable>
    </Animated.View>
  );
});

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], 6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]],
};

/** A die that tumbles (spins, bounces and flickers through faces) whenever a new roll arrives, then lands with a thud. Tapping it rolls. */
function Dice({ value, rolls, color, size, canRoll, onRoll }: { value: number | null; rolls: number; color: string; size: number; canRoll: boolean; onRoll: () => void }) {
  const spin = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<number>(value ?? 1);
  const [rolling, setRolling] = useState(false);
  const seen = useRef(rolls);

  useEffect(() => {
    if (rolls === seen.current) { if (value) setShown(value); return; }
    seen.current = rolls;
    setRolling(true);
    sfx('dice_roll');
    spin.setValue(0); hop.setValue(0);
    const flick = setInterval(() => setShown(1 + Math.floor(Math.random() * 6)), 70);
    Animated.parallel([
      Animated.timing(spin, { toValue: 1, duration: 760, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0.35, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0, duration: 110, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start(() => { clearInterval(flick); setShown(value ?? 1); setRolling(false); sfx('dice_land'); });
    return () => clearInterval(flick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolls]);

  useEffect(() => {
    if (!canRoll) { glow.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 600, useNativeDriver: true }), Animated.timing(glow, { toValue: 0, duration: 600, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [canRoll, glow]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] });
  const lift = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.55] });
  const pip = size * 0.16, pad = size * 0.16, cell = (size - pad * 2) / 3;
  return (
    <Pressable disabled={!canRoll} onPress={() => { if (!rolling) onRoll(); }} hitSlop={10}>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -6, top: -6, right: -6, bottom: -6, borderRadius: size * 0.3, backgroundColor: color, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }) }} />
      <Animated.View style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: color, transform: [{ translateY: lift }, { rotate }], shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 6, opacity: value || rolling ? 1 : 0.85 }}>
        {(PIPS[shown] ?? []).map(([r, c], i) => <View key={i} style={{ position: 'absolute', width: pip, height: pip, borderRadius: pip / 2, backgroundColor: '#1A1538', left: pad + c * cell + (cell - pip) / 2, top: pad + r * cell + (cell - pip) / 2 }} />)}
      </Animated.View>
    </Pressable>
  );
}

export function Ludo({ match, mySeat, onMove, busy, height }: { match: Match<State>; mySeat: number; onMove: (move: object) => void; busy: boolean; height: number }) {
  const { width } = useWindowDimensions();
  // The board is square and must leave about 96px under it for the dice and player strip.
  const size = Math.max(200, Math.min(width - 32, 440, height - 100));
  const inner = size - 12;
  const u = inner / 15;
  const s = match.state;
  const myTurn = match.status === 'ACTIVE' && match.turnSeat === mySeat && !busy;
  const canPick = myTurn && s.phase === 'MOVE';
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const capSeen = useRef(s.moves);
  useEffect(() => { if (s.moves !== capSeen.current) { capSeen.current = s.moves; if (s.last && s.last.captured.length > 0) sfx('capture'); } }, [s.moves]);

  const pawns = useMemo(() => {
    const list = match.players.flatMap((p) => s.tokens[p.seat].map((progress, token) => ({ seat: p.seat, token, progress, key: progress < 0 || progress > 55 ? `x${p.seat}${token}` : cellOf(p.seat, token, progress).join(':') })));
    const total = new Map<string, number>(); list.forEach((t) => total.set(t.key, (total.get(t.key) ?? 0) + 1));
    const seen = new Map<string, number>();
    return list.map((t) => { const k = seen.get(t.key) ?? 0; seen.set(t.key, k + 1); return { ...t, offset: k, count: total.get(t.key) ?? 1 }; });
  }, [match.players, s.tokens]);
  const markers = canPick && s.dice ? s.canMove.map((t) => { const p = s.tokens[mySeat][t]; const [r, c] = cellOf(mySeat, t, p < 0 ? 0 : p + s.dice!); return { t, r, c }; }) : [];

  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
      <View style={{ alignSelf: 'center', backgroundColor: '#1A1538', borderRadius: 22, padding: 6, shadowColor: '#1A1538', shadowOpacity: 0.28, shadowRadius: 14, elevation: 8 }}>
        <View style={{ width: inner, height: inner, borderRadius: 12, overflow: 'hidden' }}>
          <BoardArt size={inner} />
          {markers.length > 0 ? (
            <Svg style={StyleSheet.absoluteFill} width={inner} height={inner} viewBox="0 0 15 15" pointerEvents="none">
              {markers.map((m) => <Circle key={m.t} cx={m.c + 0.5} cy={m.r + 0.5} r={0.42} fill="none" stroke={DARK[POSITION[mySeat]]} strokeWidth={0.09} strokeDasharray="0.22 0.16" />)}
            </Svg>
          ) : null}
          {pawns.map((t) => (
            <Pawn key={`${t.seat}-${t.token}`} seat={t.seat} token={t.token} progress={t.progress} u={u} offset={t.offset} count={t.count} pulse={pulse}
              selectable={canPick && t.seat === mySeat && s.canMove.includes(t.token)} onPress={() => onMove({ action: 'move', token: t.token })} />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 }}>
        <Dice value={s.lastRoll?.value ?? null} rolls={s.rolls ?? 0} color={COLORS[POSITION[s.lastRoll?.seat ?? match.turnSeat ?? mySeat]] ?? '#888'} size={52} canRoll={myTurn && s.phase === 'ROLL'} onRoll={() => onMove({ action: 'roll' })} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: myTurn ? '#FFD21F' : 'rgba(255,255,255,.7)', fontWeight: '900', fontSize: 14 }}>
            {match.status !== 'ACTIVE' ? 'Game over' : myTurn ? (s.phase === 'ROLL' ? 'Your turn: tap the dice to roll' : `Rolled ${s.dice}: tap a glowing token`) : `${match.players.find((p) => p.seat === match.turnSeat)?.displayName ?? 'Opponent'} is playing…`}
          </Text>
          {s.lastRoll?.skipped ? <Text style={{ color: 'rgba(255,255,255,.55)', fontSize: 11 }}>{s.lastRoll.seat === mySeat ? 'You' : 'They'} rolled {s.lastRoll.value}: {s.lastRoll.skipped === 'THREE_SIXES' ? 'three sixes, turn lost' : 'no move possible'}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {match.players.map((p) => (
              <Text key={p.userId} style={{ color: p.left ? 'rgba(255,255,255,.35)' : '#fff', fontSize: 11 }}><Text style={{ color: COLORS[POSITION[p.seat]] }}>●</Text> {p.seat === mySeat ? 'You' : p.displayName} {s.home[p.seat]}/4</Text>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
