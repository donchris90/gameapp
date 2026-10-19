import { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Match } from '../types';
import { colors } from '../ui';

interface State { capacity: number; boards: number[][][]; finished: number[]; moves: number[]; solvedBy: number | null }
// Flat, clearly distinct colours from the reference Water Sort screen.
export const LIQUID = ['#F0399F', '#F01616', '#FF8A00', '#FFE600', '#3DEBC0', '#12B8E8', '#2A5BEF', '#A020F0', '#9A4A22', '#A7E635'];
const RIM = '#58A9B8';
const YELLOW = '#FFD21F';

function Tube({ tube, capacity, w, h, selected, onPress, mini }: { tube: number[]; capacity: number; w: number; h: number; selected?: boolean; onPress?: () => void; mini?: boolean }) {
  const seg = (h - 6) / capacity;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ width: w, height: h, marginTop: selected ? -12 : 0 }}>
      {!mini ? <View style={{ position: 'absolute', top: 0, left: -3, right: -3, height: Math.max(8, w * 0.22), borderRadius: 99, backgroundColor: RIM, borderWidth: 1.5, borderColor: '#8CCBD6', zIndex: 2 }} /> : null}
      {!mini && tube.length === capacity && tube.every((c) => c === tube[0]) ? <View style={{ position: 'absolute', top: -2, left: -3, right: -3, height: Math.max(12, w * 0.32), borderRadius: 99, backgroundColor: LIQUID[tube[0] % LIQUID.length], borderWidth: 2, borderColor: 'rgba(255,255,255,.92)', zIndex: 3, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: '62%', height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.55)' }} /></View> : null}
      <View style={{ flex: 1, borderWidth: mini ? 1 : 3, borderTopWidth: 0, borderColor: selected ? YELLOW : 'rgba(235,245,250,.92)', borderBottomLeftRadius: w / 2, borderBottomRightRadius: w / 2, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: 'rgba(255,255,255,.04)' }}>
        {tube.map((c, i) => <View key={i} style={{ height: seg, backgroundColor: LIQUID[c % LIQUID.length], borderTopWidth: i === tube.length - 1 ? 0 : 0 }} />)}
      </View>
    </Pressable>
  );
}

const done = (t: number[], cap: number) => t.length === cap && t.every((c) => c === t[0]);

export function WaterSort({ match, mySeat, onMove, busy }: { match: Match<State>; mySeat: number; onMove: (move: object) => void; busy: boolean }) {
  const { width } = useWindowDimensions();
  const s = match.state;
  const board = s.boards[mySeat] ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const perRow = 5;
  const w = Math.min((width - 32 - (perRow - 1) * 10) / perRow, 56);
  const h = w * 3;
  const active = match.status === 'ACTIVE';

  useEffect(() => { if (!active) setPicked(null); }, [active]);

  const tap = (i: number) => {
    if (!active || busy) return;
    if (picked === null) { if (board[i].length > 0 && !done(board[i], s.capacity)) setPicked(i); return; }
    if (picked === i) { setPicked(null); return; }
    const from = picked; setPicked(null);
    onMove({ from, to: i });
  };

  const rows: number[][] = [];
  for (let i = 0; i < board.length; i += perRow) rows.push(board.map((_, k) => k).slice(i, i + perRow));

  return (
    <View style={{ gap: 16, backgroundColor: '#111111', borderRadius: 22, padding: 14 }}>
      <View style={{ gap: 8 }}>
        {match.players.filter((p) => p.seat !== mySeat).map((p) => (
          <View key={p.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: p.left ? 0.4 : 1 }}>
            <Text style={{ color: colors.dim, width: 90 }} numberOfLines={1}>{p.displayName}</Text>
            <View style={{ flexDirection: 'row', gap: 3, flex: 1 }}>{(s.boards[p.seat] ?? []).map((t, i) => <Tube key={i} tube={t} capacity={s.capacity} w={14} h={30} mini />)}</View>
            <Text style={{ color: colors.text, fontWeight: '800' }}>{s.finished[p.seat]}</Text>
          </View>
        ))}
      </View>
      <View style={{ alignItems: 'center', gap: 22, paddingTop: 12 }}>
        {rows.map((r, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
            {r.map((i) => <Tube key={i} tube={board[i]} capacity={s.capacity} w={w} h={h} selected={picked === i} onPress={() => tap(i)} />)}
          </View>
        ))}
      </View>
      <Text style={{ color: 'rgba(255,255,255,.55)', textAlign: 'center' }}>Tap a tube, then the tube to pour into. Moves: {s.moves[mySeat]} · Finished tubes: {s.finished[mySeat]} of {LIQUID.length}</Text>
    </View>
  );
}
