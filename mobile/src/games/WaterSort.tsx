import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Match } from '../types';
import { sfx } from '../sfx';

interface State { capacity: number; boards: number[][][]; finished: number[]; moves: number[]; solvedBy: number | null; level?: number; noMoves?: boolean; canUndo?: boolean; tubesLeft?: number }

// Flat, clearly different colours (the reference app's palette). 10 colours.
// Ordered like the reference app so the colours used by early levels are the easiest to tell apart: red, blue, yellow, green, purple, orange, cyan, pink, brown, lime.
export const LIQUID = ['#F01616', '#2A5BEF', '#FFE600', '#27C93F', '#A020F0', '#FF8A00', '#12B8E8', '#F0399F', '#9A4A22', '#A7E635'];
const RIM = '#58A9B8';
const YELLOW = '#FFD21F';
const paint = (c: number) => LIQUID[c % LIQUID.length];
const done = (t: number[], cap: number) => t.length === cap && t.every((c) => c === t[0]);

/** Balanced rows, at most 6 per row (11 tubes become 6 + 5). */
function layoutRows(count: number): number[][] {
  const rows = Math.max(1, Math.ceil(count / 6));
  const per = Math.ceil(count / rows);
  const out: number[][] = [];
  for (let i = 0; i < count; i += per) out.push(Array.from({ length: Math.min(per, count - i) }, (_, k) => i + k));
  return out;
}

const RIM_H = (w: number) => Math.max(8, Math.round(w * 0.24));
const runsOf = (tube: number[]) => { const out: Array<{ c: number; n: number }> = []; for (const c of tube) { const l = out[out.length - 1]; if (l && l.c === c) l.n++; else out.push({ c, n: 1 }); } return out; };
const lerp = (p: Animated.Value, a: number, b: number, from: number[], to: number[]) => p.interpolate({ inputRange: [0, a, b, 1], outputRange: [from[0], to[0], to[1], from[1]] });

interface Pour { from: number; to: number; count: number; color: number; before: number[][]; p: Animated.Value; done?: boolean }

/**
 * A thin glass tube. While a pour is running the source tube lifts, tips over the target, and drains while the target fills.
 * `fly` is where the source tube must travel to, in pixels relative to its resting place.
 */
function Tube({ tube, cap, w, h, x, y, selected, role, pour, fly, onPress }: { tube: number[]; cap: number; w: number; h: number; x: number; y: number; selected: boolean; role?: 'out' | 'in'; pour?: Pour; fly?: { dx: number; dy: number; deg: number }; onPress: () => void }) {
  const lift = useRef(new Animated.Value(0)).current;
  const capDrop = useRef(new Animated.Value(done(tube, cap) ? 1 : 0)).current;
  const complete = done(tube, cap) && role !== 'out';
  const wasComplete = useRef(complete);
  useEffect(() => { Animated.spring(lift, { toValue: selected ? 1 : 0, useNativeDriver: false, friction: 7, tension: 120 }).start(); }, [selected, lift]);
  useEffect(() => {
    if (complete && !wasComplete.current) { sfx('complete'); capDrop.setValue(0); Animated.spring(capDrop, { toValue: 1, friction: 4, tension: 150, useNativeDriver: false }).start(); }
    else capDrop.setValue(complete ? 1 : 0);
    wasComplete.current = complete;
  }, [complete, capDrop]);

  const rimH = RIM_H(w);
  const layer = Math.floor((h - rimH - 4) / cap);
  const capH = Math.round(rimH * 1.5);
  const p = pour?.p;
  const runs = runsOf(tube);
  const layers: React.ReactNode[] = [];
  // The target gets a growing layer on top; the source's top run shrinks.
  if (role === 'in' && p && pour) layers.push(<Animated.View key="in" style={{ height: lerp(p, 0.3, 0.8, [0, pour.count * layer], [0, pour.count * layer]).interpolate({ inputRange: [0, pour.count * layer], outputRange: [0, pour.count * layer] }), backgroundColor: paint(pour.color) }} />);
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    const hgt: Animated.AnimatedInterpolation<number> | number = role === 'out' && p && pour && i === runs.length - 1
      ? p.interpolate({ inputRange: [0, 0.3, 0.8, 1], outputRange: [r.n * layer, r.n * layer, (r.n - pour.count) * layer, (r.n - pour.count) * layer] })
      : r.n * layer;
    layers.push(<Animated.View key={i} style={{ height: hgt, backgroundColor: paint(r.c) }} />);
  }
  if (role === 'in' && p && pour) {
    // replace the placeholder with a properly animated growth (0 -> count layers while the stream runs)
    layers[0] = <Animated.View key="in" style={{ height: p.interpolate({ inputRange: [0, 0.3, 0.8, 1], outputRange: [0, 0, pour.count * layer, pour.count * layer] }), backgroundColor: paint(pour.color) }} />;
  }

  const flyStyle = role === 'out' && p && fly ? [
    { translateX: p.interpolate({ inputRange: [0, 0.3, 0.85, 1], outputRange: [0, fly.dx, fly.dx, 0] }) },
    { translateY: p.interpolate({ inputRange: [0, 0.3, 0.85, 1], outputRange: [0, fly.dy, fly.dy, 0] }) },
    { rotate: p.interpolate({ inputRange: [0, 0.3, 0.85, 1], outputRange: ['0deg', `${fly.deg}deg`, `${fly.deg}deg`, '0deg'] }) },
  ] : [];
  return (
    <Animated.View style={{ position: 'absolute', left: x, top: y, width: w + 8, height: h, zIndex: role === 'out' ? 30 : 1, transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }, ...flyStyle] }}>
      <Pressable onPress={onPress} hitSlop={4} style={{ width: w + 8, height: h, alignItems: 'center' }}>
        <View style={{ position: 'absolute', top: Math.floor(rimH / 2), width: w, height: h - Math.floor(rimH / 2), borderWidth: 2, borderTopWidth: 0, borderColor: 'rgba(235,245,250,.92)', backgroundColor: 'rgba(255,255,255,.04)', borderBottomLeftRadius: w / 2, borderBottomRightRadius: w / 2, overflow: 'hidden', justifyContent: 'flex-end' }}>
          <View style={{ height: cap * layer, justifyContent: 'flex-end' }}>{layers}</View>
          <View pointerEvents="none" style={{ position: 'absolute', left: 3, top: 4, bottom: w / 2, width: Math.max(3, w * 0.12), borderRadius: 4, backgroundColor: 'rgba(255,255,255,.22)' }} />
        </View>
        <View style={{ position: 'absolute', top: 0, width: w + 8, height: rimH, borderRadius: rimH / 2, backgroundColor: RIM, borderWidth: 1.5, borderColor: '#8CCBD6', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: '78%', height: '45%', backgroundColor: '#1D3A40', opacity: 0.55, borderRadius: rimH / 2 }} />
        </View>
        {complete ? (
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, width: w + 8, height: capH, borderRadius: capH / 2, backgroundColor: paint(tube[0]), borderWidth: 2, borderColor: 'rgba(255,255,255,.92)', alignItems: 'center', justifyContent: 'center', opacity: capDrop, transform: [{ translateY: capDrop.interpolate({ inputRange: [0, 1], outputRange: [-capH * 2.2, 0] }) }] }}>
            <View style={{ width: '62%', height: Math.max(2, Math.round(capH * 0.22)), borderRadius: capH / 4, backgroundColor: 'rgba(255,255,255,.55)' }} />
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function ActionButton({ label, note, disabled, onPress, glyph }: { label: string; note?: string; disabled?: boolean; onPress: () => void; glyph: string }) {
  return (
    <View style={{ alignItems: 'center', width: 92, opacity: disabled ? 0.4 : 1 }}>
      <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => ({ width: 88, height: 40, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: '#171022' }}>{glyph}</Text>
      </Pressable>
      <Text style={{ marginTop: 4, color: 'rgba(255,255,255,.55)', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 }}>{label}</Text>
      {note ? <Text style={{ color: YELLOW, fontSize: 10, fontWeight: '800' }}>{note}</Text> : null}
    </View>
  );
}

function Chunky({ label, color, edge, onPress }: { label: string; color: string; edge: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: '100%', height: 44, borderRadius: 10, borderBottomWidth: 4, borderBottomColor: edge, backgroundColor: color, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: pressed ? 2 : 0 }] })}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 }}>{label}</Text>
    </Pressable>
  );
}

function Dialog({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.82)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <View style={{ width: '82%', maxWidth: 330, backgroundColor: '#3A3A3A', borderRadius: 14, paddingTop: 34, paddingBottom: 18, paddingHorizontal: 18, alignItems: 'center', gap: 10, borderWidth: 2, borderColor: '#2A2A2A' }}>
          <View style={{ position: 'absolute', top: -16, left: -8, right: -8, height: 34, backgroundColor: '#6B2FA0', borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#8C4FC4' }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 }}>{title}</Text>
          </View>
          <Text style={{ color: '#fff', textAlign: 'center', fontSize: 14, marginVertical: 4 }}>{body}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function WaterSort({ match, mySeat, onMove, busy, height, onQuit }: { match: Match<State>; mySeat: number; onMove: (move: object) => void; busy: boolean; height: number; onQuit: () => void }) {
  const { width } = useWindowDimensions();
  const s = match.state;
  const live = s.boards[mySeat] ?? [];
  const cap = s.capacity;
  const [picked, setPicked] = useState<number | null>(null);
  const [pour, setPour] = useState<Pour | null>(null);
  const active = match.status === 'ACTIVE';
  const [closed, setClosed] = useState(false);
  const level = s.level ?? 1;
  // While a pour is playing the board shows how it looked before it, so nothing jumps when the server answers early.
  const board = pour ? pour.before : live;

  useEffect(() => { if (!active) setPicked(null); }, [active]);
  useEffect(() => { setPicked(null); setClosed(false); setPour(null); }, [match.id]);
  // Release the pour once its animation is over and the request has finished (answered or refused).
  useEffect(() => { if (pour?.done && !busy) setPour(null); }, [pour, busy]);
  useEffect(() => { if (!pour) return; const t = setTimeout(() => setPour(null), 6000); return () => clearTimeout(t); }, [pour?.p]);
  const noMoves = active && !!s.noMoves && !pour;
  useEffect(() => { if (noMoves) sfx('nomoves'); else setClosed(false); }, [noMoves]);

  // Layout: thin tubes in balanced rows, each at an absolute spot so a tube can fly to another.
  const rows = layoutRows(board.length);
  const actionsH = 78, headerH = 40;
  const boardH = Math.max(160, height - actionsH - headerH);
  const rowGap = rows.length >= 3 ? 26 : 44;
  const perRow = rows[0]?.length ?? 1;
  const gap = 12;
  const w = Math.max(18, Math.min(30, Math.floor((width - 56) / perRow) - gap));
  const h = Math.max(84, Math.min(Math.round(w * 4.4), Math.floor((boardH - (rows.length - 1) * rowGap - 40) / rows.length)));
  const slot = w + 8;
  const pos = new Map<number, { x: number; y: number }>();
  const totalH = rows.length * h + (rows.length - 1) * rowGap;
  const boardW = width - 20 - 32; // panel width inside the screen padding
  rows.forEach((r, ri) => {
    const rowW = r.length * slot + (r.length - 1) * gap;
    r.forEach((i, k) => pos.set(i, { x: (boardW - rowW) / 2 + k * (slot + gap), y: Math.max(20, (boardH - totalH) / 2) + ri * (h + rowGap) }));
  });

  const startPour = (from: number, to: number) => {
    const src = board[from], dst = board[to];
    const color = src[src.length - 1];
    let run = 0; for (let i = src.length - 1; i >= 0 && src[i] === color; i--) run++;
    const count = Math.min(run, cap - dst.length);
    const p = new Animated.Value(0);
    setPour({ from, to, count, color, before: board.map((t) => t.slice()), p });
    sfx('pour');
    onMove({ from, to });
    // Keep showing the finished pour until the server has answered; clearing earlier flashed the old board (liquid went back, then vanished).
    Animated.timing(p, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start(() => setPour((cur) => (cur && cur.p === p ? { ...cur, done: true } : cur)));
  };

  const tap = (i: number) => {
    if (!active || busy || noMoves || pour) return;
    if (picked === null) { if (board[i].length > 0 && !done(board[i], cap)) { setPicked(i); sfx('tap'); } return; }
    if (picked === i) { setPicked(null); return; }
    const src = board[picked], dst = board[i];
    const ok = src.length > 0 && dst.length < cap && (dst.length === 0 || dst[dst.length - 1] === src[src.length - 1]);
    const from = picked; setPicked(null);
    if (!ok) { onMove({ from, to: i }); return; } // the server explains why it is not allowed
    startPour(from, i);
  };

  // Where the source tube has to go: its mouth sits just above the target's mouth, tipped towards it.
  let fly: { dx: number; dy: number; deg: number } | undefined;
  let streamTop = 0, streamH = 0, streamX = 0;
  if (pour) {
    const a = pos.get(pour.from)!, b = pos.get(pour.to)!;
    const toRight = b.x >= a.x;
    const deg = toRight ? 68 : -68;
    const rad = (Math.abs(deg) * Math.PI) / 180;
    const tCx = b.x + slot / 2;
    const cx = toRight ? tCx - (h / 2) * Math.sin(rad) - 4 : tCx + (h / 2) * Math.sin(rad) + 4;
    const cy = b.y - 10 + (h / 2) * Math.cos(rad);
    fly = { dx: cx - (a.x + slot / 2), dy: cy - (a.y + h / 2), deg };
    streamX = tCx - 2;
    streamTop = b.y - 6;
    const fillTo = b.y + h - ((pour.before[pour.to].length + pour.count) * Math.floor((h - RIM_H(w) - 4) / cap)) - 2;
    streamH = Math.max(10, fillTo - streamTop);
  }
  const gameOver = noMoves && (s.tubesLeft ?? 0) === 0;
  const solved = match.status === 'FINISHED' && match.players.find((p) => p.seat === mySeat)?.result === 'WON';

  return (
    <View style={{ flex: 1, backgroundColor: '#111111', borderRadius: 22, paddingHorizontal: 10, paddingTop: 8 }}>
      <View style={{ height: headerH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Level {level}</Text>
        <Text style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, fontWeight: '700' }}>Moves {s.moves[mySeat]}</Text>
      </View>
      {noMoves && !closed ? <Text style={{ position: 'absolute', top: 44, left: 0, right: 0, textAlign: 'center', color: '#E31616', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 }}>NO MORE MOVES!</Text> : null}

      <View style={{ flex: 1 }}>
        {board.map((t, i) => (
          <Tube key={i} tube={t} cap={cap} w={w} h={h} x={pos.get(i)?.x ?? 0} y={pos.get(i)?.y ?? 0} selected={picked === i}
            role={pour?.from === i ? 'out' : pour?.to === i ? 'in' : undefined} pour={pour && (pour.from === i || pour.to === i) ? pour : undefined} fly={pour?.from === i ? fly : undefined} onPress={() => tap(i)} />
        ))}
        {pour ? (
          <Animated.View pointerEvents="none" style={{ position: 'absolute', left: streamX, top: streamTop, width: 4, height: streamH, borderRadius: 2, backgroundColor: paint(pour.color), zIndex: 40,
            opacity: pour.p.interpolate({ inputRange: [0, 0.3, 0.34, 0.78, 0.82, 1], outputRange: [0, 0, 1, 1, 0, 0] }),
            transform: [{ scaleY: pour.p.interpolate({ inputRange: [0, 0.3, 0.4, 1], outputRange: [0, 0, 1, 1] }) }] }} />
        ) : null}
      </View>

      <View style={{ height: actionsH, flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'flex-start', paddingTop: 6 }}>
        <ActionButton glyph="↶" label="UNDO" disabled={!active || busy || !!pour || !s.canUndo} onPress={() => onMove({ action: 'undo' })} />
        <ActionButton glyph="＋🧪" label="ADD TUBE" note={`${s.tubesLeft ?? 0} left`} disabled={!active || busy || !!pour || (s.tubesLeft ?? 0) === 0} onPress={() => onMove({ action: 'addTube' })} />
        <ActionButton glyph="⟳" label="RESTART" disabled={!active || busy || !!pour} onPress={() => onMove({ action: 'restart' })} />
      </View>

      {noMoves && !closed && !gameOver ? (
        <Dialog title="NO MOVES POSSIBLE" body="There are no more moves on the board. Undo, add a tube or start the level again.">
          {s.canUndo ? <Chunky label="UNDO" color="#2E7D32" edge="#1B5E20" onPress={() => onMove({ action: 'undo' })} /> : null}
          {(s.tubesLeft ?? 0) > 0 ? <Chunky label="ADD TUBE" color="#1E7BE0" edge="#1257A6" onPress={() => onMove({ action: 'addTube' })} /> : null}
          <Chunky label="RESTART" color="#C77A00" edge="#8A5400" onPress={() => onMove({ action: 'restart' })} />
          <Pressable onPress={() => setClosed(true)}><Text style={{ color: 'rgba(255,255,255,.6)', fontWeight: '800', marginTop: 4 }}>Close</Text></Pressable>
        </Dialog>
      ) : null}
      {gameOver ? (
        <Dialog title="GAME OVER" body="No moves left and no extra tubes. Retry the level or go back.">
          <Chunky label="RETRY" color="#2E7D32" edge="#1B5E20" onPress={() => onMove({ action: 'restart' })} />
          {s.canUndo ? <Chunky label="UNDO LAST MOVE" color="#1E7BE0" edge="#1257A6" onPress={() => onMove({ action: 'undo' })} /> : null}
          <Chunky label="QUIT" color="#B3261E" edge="#7F1D17" onPress={onQuit} />
        </Dialog>
      ) : null}
      {solved ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '30%', alignItems: 'center' }}>
          <View style={{ paddingHorizontal: 28, paddingVertical: 22, borderRadius: 22, backgroundColor: '#1A1A1A', borderWidth: 2, borderColor: YELLOW, alignItems: 'center' }}>
            <Text style={{ fontSize: 44 }}>💧✨</Text>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1, marginTop: 6 }}>LEVEL {level} COMPLETE!</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
