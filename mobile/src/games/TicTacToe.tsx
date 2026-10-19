import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Match } from '../types';

interface State { board: Array<number | null>; marks: Record<number, string>; turn: number; winLine: number[] | null }

// Deep navy + neon X/O, taken from the reference app's Tic Tac Toe screen.
const T = { panel: '#0B1020', border: 'rgba(255,255,255,0.13)', text: '#F4F7FF', muted: '#A9B4D0', x: '#5EEAD4', o: '#FDBA74' };

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
  const mine = s.marks[mySeat];

  return (
    <View style={{ backgroundColor: T.panel, borderRadius: 26, padding: 14, gap: 12, alignItems: 'center' }}>
      <Text style={{ color: T.muted, fontWeight: '800' }}>You are <Text style={{ color: col(mySeat), fontSize: 20, fontWeight: '900' }}>{mine}</Text></Text>
      <View style={{ padding: pad, gap, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: T.border }}>
        {[0, 1, 2].map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap }}>
            {[0, 1, 2].map((c) => {
              const i = r * 3 + c; const v = s.board[i]; const win = line.has(i);
              return (
                <Pressable key={i} disabled={!myTurn || v !== null} onPress={() => onMove({ cell: i })}
                  style={{ width: size, height: size, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', borderColor: win && v !== null ? col(v) : myTurn && v === null ? 'rgba(255,255,255,0.25)' : 'transparent', backgroundColor: win ? 'rgba(255,255,255,0.16)' : v !== null ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.045)', opacity: dim && !win ? 0.45 : 1 }}>
                  {v !== null ? <Text style={{ fontSize: size * 0.58, lineHeight: size * 0.7, includeFontPadding: false, fontWeight: '900', color: col(v) }}>{s.marks[v]}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
