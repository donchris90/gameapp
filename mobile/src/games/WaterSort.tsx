import { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Match } from '../types';
import { colors } from '../ui';

interface State { capacity: number; boards: number[][][]; finished: number[]; moves: number[]; solvedBy: number | null }
export const LIQUID = ['#FF5A6E', '#FFB020', '#F4E04D', '#2ED573', '#35C4F0', '#7C5CFF', '#E56BD8'];

function Tube({ tube, capacity, w, h, selected, onPress, mini }: { tube: number[]; capacity: number; w: number; h: number; selected?: boolean; onPress?: () => void; mini?: boolean }) {
  const seg = (h - 6) / capacity;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ width: w, height: h, marginTop: selected ? -12 : 0 }}>
      <View style={{ flex: 1, borderWidth: mini ? 1 : 3, borderColor: selected ? colors.gold : '#8FA0D8', borderBottomLeftRadius: w / 2, borderBottomRightRadius: w / 2, borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: 'rgba(255,255,255,0.05)' }}>
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
    <View style={{ gap: 16 }}>
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
      <Text style={{ color: colors.dim, textAlign: 'center' }}>Tap a tube, then the tube to pour into. Moves: {s.moves[mySeat]} · Finished tubes: {s.finished[mySeat]} of {LIQUID.length}</Text>
    </View>
  );
}
