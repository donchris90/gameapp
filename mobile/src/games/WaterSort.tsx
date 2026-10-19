import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Match } from '../types';
import { sfx } from '../sfx';

interface State { capacity: number; boards: number[][][]; finished: number[]; moves: number[]; solvedBy: number | null; level?: number; noMoves?: boolean; canUndo?: boolean; tubesLeft?: number }

// Flat, clearly different colours (the reference app's palette). 10 colours.
export const LIQUID = ['#F0399F', '#F01616', '#FF8A00', '#FFE600', '#3DEBC0', '#12B8E8', '#2A5BEF', '#A020F0', '#9A4A22', '#A7E635'];
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

/** A thin glass tube: glass body, teal rim on top, a shine down the side, and a coloured cap once it is finished. */
function Tube({ tube, cap, w, h, selected, hint, onPress }: { tube: number[]; cap: number; w: number; h: number; selected: boolean; hint?: boolean; onPress: () => void }) {
  const lift = useRef(new Animated.Value(0)).current;
  const capDrop = useRef(new Animated.Value(done(tube, cap) ? 1 : 0)).current;
  const complete = done(tube, cap);
  const wasComplete = useRef(complete);
  useEffect(() => { Animated.spring(lift, { toValue: selected ? 1 : 0, useNativeDriver: true, friction: 7, tension: 120 }).start(); }, [selected, lift]);
  useEffect(() => {
    if (complete && !wasComplete.current) { sfx('complete'); capDrop.setValue(0); Animated.spring(capDrop, { toValue: 1, friction: 4, tension: 150, useNativeDriver: true }).start(); }
    else capDrop.setValue(complete ? 1 : 0);
    wasComplete.current = complete;
  }, [complete, capDrop]);

  const rimH = Math.max(8, Math.round(w * 0.24));
  const layer = Math.floor((h - rimH - 4) / cap);
  const capH = Math.round(rimH * 1.5);
  return (
    <Animated.View style={{ width: w + 8, height: h, transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }] }}>
      <Pressable onPress={onPress} hitSlop={4} style={{ width: w + 8, height: h, alignItems: 'center' }}>
        <View style={{ position: 'absolute', top: Math.floor(rimH / 2), width: w, height: h - Math.floor(rimH / 2), borderWidth: 2, borderTopWidth: 0, borderColor: hint ? YELLOW : 'rgba(235,245,250,.92)', backgroundColor: 'rgba(255,255,255,.04)', borderBottomLeftRadius: w / 2, borderBottomRightRadius: w / 2, overflow: 'hidden', justifyContent: 'flex-end' }}>
          <View style={{ height: cap * layer, justifyContent: 'flex-end' }}>
            {tube.map((c, i) => <View key={i} style={{ height: layer, backgroundColor: paint(c), borderTopWidth: i === tube.length - 1 || tube[i + 1] !== c ? 0 : 0, borderBottomWidth: i > 0 && tube[i - 1] !== c ? 0 : 0 }} />)}
          </View>
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
  const board = s.boards[mySeat] ?? [];
  const cap = s.capacity;
  const [picked, setPicked] = useState<number | null>(null);
  const active = match.status === 'ACTIVE';
  const [closed, setClosed] = useState(false); // the "no moves" dialog was dismissed
  const level = s.level ?? 1;

  useEffect(() => { if (!active) setPicked(null); }, [active]);
  useEffect(() => { setPicked(null); setClosed(false); }, [match.id]);
  const noMoves = active && !!s.noMoves;
  useEffect(() => { if (noMoves) sfx('nomoves'); else setClosed(false); }, [noMoves]);

  const tap = (i: number) => {
    if (!active || busy || noMoves) return;
    if (picked === null) { if (board[i].length > 0 && !done(board[i], cap)) { setPicked(i); sfx('tap'); } return; }
    if (picked === i) { setPicked(null); return; }
    const from = picked; setPicked(null);
    sfx('pour');
    onMove({ from, to: i });
  };

  // Tubes are thin, laid out in balanced rows, and sized to the space we were given.
  const rows = layoutRows(board.length);
  const actionsH = 78, headerH = 40;
  const boardH = Math.max(160, height - actionsH - headerH);
  const rowGap = rows.length >= 3 ? 26 : 40;
  const perRow = rows[0]?.length ?? 1;
  const w = Math.max(18, Math.min(30, Math.floor((width - 56) / perRow) - 12));
  const h = Math.max(84, Math.min(Math.round(w * 4.4), Math.floor((boardH - (rows.length - 1) * rowGap - 24) / rows.length)));
  const gameOver = noMoves && (s.tubesLeft ?? 0) === 0;
  const solved = match.status === 'FINISHED' && match.players.find((p) => p.seat === mySeat)?.result === 'WON';

  return (
    <View style={{ flex: 1, backgroundColor: '#111111', borderRadius: 22, paddingHorizontal: 10, paddingTop: 8 }}>
      <View style={{ height: headerH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Level {level}</Text>
        <Text style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, fontWeight: '700' }}>Moves {s.moves[mySeat]} · {s.finished[mySeat]}/{board.filter((t) => t.length > 0 || done(t, cap)).length || '-'} done</Text>
      </View>
      {noMoves && !closed ? <Text style={{ position: 'absolute', top: 44, left: 0, right: 0, textAlign: 'center', color: '#E31616', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 }}>NO MORE MOVES!</Text> : null}

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: rowGap }}>
        {rows.map((r, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
            {r.map((i) => <Tube key={i} tube={board[i]} cap={cap} w={w} h={h} selected={picked === i} onPress={() => tap(i)} />)}
          </View>
        ))}
      </View>

      <View style={{ height: actionsH, flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'flex-start', paddingTop: 6 }}>
        <ActionButton glyph="↶" label="UNDO" disabled={!active || busy || !s.canUndo} onPress={() => onMove({ action: 'undo' })} />
        <ActionButton glyph="＋🧪" label="ADD TUBE" note={`${s.tubesLeft ?? 0} left`} disabled={!active || busy || (s.tubesLeft ?? 0) === 0} onPress={() => onMove({ action: 'addTube' })} />
        <ActionButton glyph="⟳" label="RESTART" disabled={!active || busy} onPress={() => onMove({ action: 'restart' })} />
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
