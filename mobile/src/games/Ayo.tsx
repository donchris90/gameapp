import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Match } from '../types';
import { useTheme } from '../cosmetics';
import { colors } from '../ui';

interface State { pits: number[]; captured: [number, number]; turn: number; last: { seat: number; pit: number; endPit: number; captured: number } | null }

/** Seeds are sown counter-clockwise: along your row left to right, then back along the opponent's row. */
export function Ayo({ match, mySeat, onMove, busy }: { match: Match<State>; mySeat: number; onMove: (move: object) => void; busy: boolean }) {
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const s = match.state;
  const pit = Math.min((width - 32 - 5 * 6) / 6, 64);
  const mine = mySeat === 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
  const theirs = mySeat === 0 ? [11, 10, 9, 8, 7, 6] : [5, 4, 3, 2, 1, 0];
  const myTurn = match.status === 'ACTIVE' && match.turnSeat === mySeat && !busy;
  const opp = 1 - mySeat;

  const Pit = ({ i, playable }: { i: number; playable: boolean }) => {
    const n = s.pits[i];
    const last = s.last && (s.last.pit === i || s.last.endPit === i);
    return (
      <Pressable disabled={!playable || n === 0} onPress={() => onMove({ pit: i })}
        style={{ width: pit, height: pit * 1.15, borderRadius: pit / 2, backgroundColor: theme.pit, borderWidth: 3, borderColor: playable && n > 0 ? colors.gold : last ? colors.accent : '#2B1A0E', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: pit * 0.7, justifyContent: 'center', gap: 2, minHeight: 14 }}>
          {Array.from({ length: Math.min(n, 12) }, (_, k) => <View key={k} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#F4D58D' }} />)}
        </View>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16, marginTop: 2 }}>{n}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.dim, fontWeight: '700' }}>Opponent captured <Text style={{ color: colors.text }}>{s.captured[opp]}</Text></Text>
        <Text style={{ color: colors.dim, fontWeight: '700' }}>First to 25</Text>
      </View>
      <View style={{ backgroundColor: theme.wood, borderRadius: 22, padding: 12, gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{theirs.map((i) => <Pit key={i} i={i} playable={false} />)}</View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{mine.map((i) => <Pit key={i} i={i} playable={myTurn} />)}</View>
      </View>
      <Text style={{ color: colors.dim, fontWeight: '700' }}>You captured <Text style={{ color: colors.gold, fontSize: 18 }}>{s.captured[mySeat]}</Text>
        {s.last && s.last.captured > 0 ? <Text style={{ color: colors.good }}>   {s.last.seat === mySeat ? 'You' : 'They'} took {s.last.captured}!</Text> : null}
      </Text>
    </View>
  );
}
