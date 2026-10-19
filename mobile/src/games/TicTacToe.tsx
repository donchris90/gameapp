import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Match } from '../types';
import { colors } from '../ui';

interface State { board: Array<number | null>; marks: Record<number, string>; turn: number; winLine: number[] | null }

export function TicTacToe({ match, mySeat, onMove, busy }: { match: Match<State>; mySeat: number; onMove: (move: object) => void; busy: boolean }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 420);
  const cell = (size - 16) / 3;
  const s = match.state;
  const myTurn = match.status === 'ACTIVE' && match.turnSeat === mySeat && !busy;

  return (
    <View style={{ width: size, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {s.board.map((v, i) => {
        const win = s.winLine?.includes(i);
        const free = v === null;
        return (
          <Pressable key={i} disabled={!myTurn || !free} onPress={() => onMove({ cell: i })}
            style={{ width: cell, height: cell, borderRadius: 18, backgroundColor: win ? '#2C3F2A' : colors.card, borderWidth: 2, borderColor: win ? colors.good : myTurn && free ? colors.line : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {v !== null ? <Text style={{ fontSize: cell * 0.6, fontWeight: '900', color: v === 0 ? colors.x : colors.o }}>{s.marks[v]}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
