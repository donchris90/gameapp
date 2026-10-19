import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Match } from '../types';
import { Button, colors } from '../ui';

interface State {
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

export function Ludo({ match, mySeat, onMove, busy }: { match: Match<State>; mySeat: number; onMove: (move: object) => void; busy: boolean }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 440);
  const u = (size - 12) / 15;
  const s = match.state;
  const myTurn = match.status === 'ACTIVE' && match.turnSeat === mySeat && !busy;
  const canPick = myTurn && s.phase === 'MOVE';
  const seatsInPlay = match.players.map((p) => p.seat);

  // Group tokens by square so stacked ones fan out a little.
  const placed: Array<{ seat: number; token: number; r: number; c: number; offset: number }> = [];
  const seen = new Map<string, number>();
  for (const seat of seatsInPlay) {
    s.tokens[seat].forEach((p, token) => {
      const [r, c] = cellOf(seat, token, p);
      const key = p < 0 || p > 55 ? `${seat}:${token}` : `${r}:${c}`;
      const k = seen.get(key) ?? 0; seen.set(key, k + 1);
      placed.push({ seat, token, r, c, offset: k });
    });
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignSelf: 'center', backgroundColor: '#1A1538', borderRadius: 22, padding: 6 }}>
      <View style={{ width: size - 12, height: size - 12, backgroundColor: '#FFFFFF', borderRadius: 12, overflow: 'hidden' }}>
        {YARD_ORIGIN.map(([r, c], pos) => (
          <View key={pos} style={{ position: 'absolute', left: c * u, top: r * u, width: 6 * u, height: 6 * u, backgroundColor: COLORS[pos] }}>
            <View style={{ position: 'absolute', left: u, top: u, width: 4 * u, height: 4 * u, backgroundColor: '#fff', borderRadius: u }} />
          </View>
        ))}
        {RING.map(([r, c], i) => {
          const start = i % 13 === 0;
          return (
            <View key={i} style={{ position: 'absolute', left: c * u, top: r * u, width: u, height: u, borderWidth: 0.5, borderColor: '#B9B29C', backgroundColor: start ? COLORS[POSITION.indexOf(i / 13)] : '#fff', alignItems: 'center', justifyContent: 'center' }}>
              {SAFE.has(i) && !start ? <Text style={{ fontSize: u * 0.6, color: '#999' }}>★</Text> : null}
            </View>
          );
        })}
        {[0, 1, 2, 3].flatMap((pos) => Array.from({ length: 5 }, (_, k) => {
          const [r, c] = HOME_COL[pos](k);
          return <View key={`${pos}-${k}`} style={{ position: 'absolute', left: c * u, top: r * u, width: u, height: u, backgroundColor: COLORS[pos], borderWidth: 0.5, borderColor: '#fff' }} />;
        }))}
        <View style={{ position: 'absolute', left: 6 * u, top: 6 * u, width: 3 * u, height: 3 * u, backgroundColor: '#2B3358', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: u * 1.2 }}>🏠</Text>
        </View>

        {placed.map(({ seat, token, r, c, offset }) => {
          const can = canPick && seat === mySeat && s.canMove.includes(token);
          const d = u * 0.78;
          return (
            <Pressable key={`${seat}-${token}`} disabled={!can} onPress={() => onMove({ action: 'move', token })}
              style={{ position: 'absolute', left: c * u + (u - d) / 2 + offset * 3, top: r * u + (u - d) / 2 - offset * 3, width: d, height: d, borderRadius: d / 2, backgroundColor: COLORS[POSITION[seat]], borderWidth: can ? 3 : 2, borderColor: can ? '#fff' : DARK[POSITION[seat]], shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, elevation: can ? 8 : 3, alignItems: 'center', justifyContent: 'center', zIndex: can ? 5 : 1 }}>
              <Text style={{ color: '#fff', fontSize: d * 0.45, fontWeight: '900' }}>{token + 1}</Text>
            </Pressable>
          );
        })}
      </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS[POSITION[mySeat]] ?? '#888' }} />
          <Text style={{ color: colors.text, fontWeight: '700' }}>You · {s.home[mySeat]}/4 home</Text>
        </View>
        <Text style={{ color: colors.text, fontSize: 44 }}>{s.lastRoll ? FACE[s.lastRoll.value] : ''}</Text>
      </View>
      {s.lastRoll?.skipped ? <Text style={{ color: colors.dim, textAlign: 'center' }}>{s.lastRoll.seat === mySeat ? 'You' : 'They'} rolled {s.lastRoll.value}: {s.lastRoll.skipped === 'THREE_SIXES' ? 'three sixes, turn lost' : 'no move possible'}</Text> : null}
      {myTurn && s.phase === 'ROLL' ? <Button title="Roll the dice" onPress={() => onMove({ action: 'roll' })} /> : null}
      {canPick ? <Text style={{ color: colors.accent, textAlign: 'center', fontWeight: '800' }}>Tap a glowing token to move {s.dice}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
        {match.players.filter((p) => p.seat !== mySeat).map((p) => (
          <Text key={p.userId} style={{ color: p.left ? colors.dim : colors.text }}><Text style={{ color: COLORS[POSITION[p.seat]] }}>●</Text> {p.displayName} {s.home[p.seat]}/4</Text>
        ))}
      </View>
    </View>
  );
}
