import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Match } from '../types';

interface State { board: Array<number | null>; marks: Record<number, string>; turn: number; winLine: number[] | null }

// Deep navy + neon X/O, taken from the reference app's Tic Tac Toe screen.
const T = { panel: '#0B1020', border: 'rgba(255,255,255,0.13)', text: '#F4F7FF', muted: '#A9B4D0', x: '#5EEAD4', o: '#FDBA74' };

function Mark({ v, size, color, text }: { v: number | null; size: number; color: string; text: string }) {
  const pop = useRef(new Animated.Value(v !== null ? 1 : 0)).current;
  const was = useRef(v);
  useEffect(() => {
    if (v !== null && was.current === null) { pop.setValue(0); Animated.spring(pop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start(); }
    else pop.setValue(v !== null ? 1 : 0);
    was.current = v;
  }, [v, pop]);
  return <Animated.Text style={{ fontSize: size * 0.58, lineHeight: size * 0.7, includeFontPadding: false, fontWeight: '900', color, transform: [{ scale: pop }] }}>{text}</Animated.Text>;
}

export function TicTacToe({ match, mySeat, onMove, busy }: { match: Match<State>; mySeat: number; onMove: (move: object) => void; busy: boolean }) {
  const { width } = useWindowDimensions();
  const s = match.state;
  const myTurn = match.status === 'ACTIVE' && match.turnSeat === mySeat && !busy;
  const pad = 12, gap = 10;
  const outer = Math.min(width - 32, 400);
  const size = Math.floor((outer - pad * 2 - gap * 2) / 3);
  const line = new Set(s.winLine ?? []);
  const dim = line.size > 0;
  const col = (seat: number) => (seat === 0 ? T.x : T.o);

  return (
    <View style={{ backgroundColor: T.panel, borderRadius: 26, padding: 14, gap: 12, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8, alignSelf: 'stretch' }}>
        {[0, 1].map((seat) => {
          const p = match.players.find((q) => q.seat === seat);
          const active = match.status === 'ACTIVE' && match.turnSeat === seat;
          return (
            <View key={seat} style={{ flex: 1, borderWidth: 1.5, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14, gap: 4, borderColor: active ? col(seat) : T.border, backgroundColor: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)' }}>
              <Text style={{ color: col(seat), fontSize: 28, fontWeight: '900', lineHeight: 32 }}>{s.marks[seat]}</Text>
              <Text numberOfLines={1} style={{ color: T.text, fontSize: 14, fontWeight: '800' }}>{seat === mySeat ? 'You' : p?.displayName ?? '—'}</Text>
            </View>
          );
        })}
      </View>
      <View style={{ padding: pad, gap, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: T.border }}>
        {[0, 1, 2].map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap }}>
            {[0, 1, 2].map((c) => {
              const i = r * 3 + c; const v = s.board[i]; const win = line.has(i);
              return (
                <Pressable key={i} disabled={!myTurn || v !== null} onPress={() => onMove({ cell: i })}
                  style={{ width: size, height: size, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', borderColor: win && v !== null ? col(v) : myTurn && v === null ? 'rgba(255,255,255,0.25)' : 'transparent', backgroundColor: win ? 'rgba(255,255,255,0.16)' : v !== null ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.045)', opacity: dim && !win ? 0.45 : 1 }}>
                  <Mark v={v} size={size} color={v !== null ? col(v) : T.text} text={v !== null ? s.marks[v] : ''} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
