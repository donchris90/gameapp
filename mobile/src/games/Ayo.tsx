import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Match } from '../types';

interface State { pits: number[]; captured: [number, number]; turn: number; moves: number; last: { seat: number; pit: number; endPit: number; captured: number } | null }

// Dark wood + gold table, taken from the reference app's Ayo screen.
const C = {
  panel: '#1C1009', text: '#FFF4E2', muted: '#CDB898', gold: '#F5B841', onGold: '#2A1505', border: 'rgba(255,214,150,0.16)',
  surface: 'rgba(255,232,190,0.10)', wood: '#E3B87D', woodEdge: '#B98A4F', bowl: '#C99456', bowlIn: '#B07A3E', tap: '#2F9E5B',
};
const SEEDS = ['#C9CFC8', '#DAD6C8', '#B9C0B4', '#E4DECF', '#C2C6BD', '#D3CFC0'];
const seedSpot = (k: number, pit: number) => { const r = pit * 0.085 * Math.sqrt(k + 0.4); const a = k * 2.399963; return { x: r * Math.cos(a), y: r * Math.sin(a) }; };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const STEP_MS = 230;

/**
 * Two columns of six bowls. Sowing runs UP your column (right) and DOWN your opponent's (left).
 * Every move, yours or theirs, is replayed seed by seed from the previous board, then the board snaps to the server's truth.
 */
export function Ayo({ match, mySeat, onMove, busy }: { match: Match<State>; mySeat: number; onMove: (move: object) => void; busy: boolean }) {
  const s = match.state;
  const [board, setBoard] = useState<number[]>(s.pits);
  const [hot, setHot] = useState<number | null>(null);
  const [hand, setHand] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [boardW, setBoardW] = useState(0);
  const prev = useRef<{ pits: number[]; moves: number }>({ pits: s.pits, moves: s.moves });
  const run = useRef(0);
  const alive = useRef(true);
  const latest = useRef(s); latest.current = s;
  useEffect(() => { alive.current = true; return () => { alive.current = false; run.current++; }; }, []);

  useEffect(() => {
    const before = prev.current;
    prev.current = { pits: s.pits, moves: s.moves };
    const last = s.last;
    if (s.moves !== before.moves + 1 || !last) { run.current++; setBoard(s.pits); setHot(null); setHand(0); setAnimating(false); return; }
    const id = ++run.current;
    (async () => {
      setAnimating(true);
      const b = before.pits.slice();
      let left = b[last.pit]; b[last.pit] = 0; setBoard(b.slice()); setHand(left); setHot(last.pit);
      await sleep(STEP_MS);
      let pos = last.pit;
      while (left > 0 && alive.current && run.current === id) {
        pos = (pos + 1) % 12; if (pos === last.pit) continue;
        b[pos] += 1; left -= 1; setBoard(b.slice()); setHot(pos); setHand(left);
        await sleep(STEP_MS);
      }
      if (alive.current && run.current === id) { setBoard(latest.current.pits); setHot(null); setHand(0); setAnimating(false); }
    })();
  }, [s.moves]);

  const rightCol = mySeat === 0 ? [5, 4, 3, 2, 1, 0] : [11, 10, 9, 8, 7, 6];
  const leftCol = mySeat === 0 ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5];
  const opp = 1 - mySeat;
  const active = match.status === 'ACTIVE';
  const myTurn = active && match.turnSeat === mySeat;
  const canTap = myTurn && !busy && !animating;
  const oppName = match.players.find((p) => p.seat === opp)?.displayName ?? 'Opponent';
  const ownerOf = (i: number) => (i < 6 ? 0 : 1);

  const colW = boardW > 0 ? (boardW - 20 - 14 - 4) / 2 : 120;
  const pitSize = Math.max(54, Math.min(Math.round(colW * 0.5), 70));
  const seedSize = Math.round(pitSize * 0.23);
  const inner = pitSize - 18;

  // A plain render function (NOT a nested component): the screen re-renders every second for the clock, and a
  // nested component would be re-created each time, which swallows taps.
  const renderPit = (i: number) => {
    const n = board[i];
    const mine = ownerOf(i) === mySeat;
    const tappable = canTap && mine && n > 0;
    return (
      <Pressable key={i} disabled={!tappable} hitSlop={4}
        onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} onMove({ pit: i }); }}
        style={{ width: pitSize, height: pitSize, alignSelf: 'center', transform: [{ scale: hot === i ? 1.08 : 1 }] }}>
        <View style={{ flex: 1, borderRadius: 999, borderWidth: 2, padding: 1, borderColor: hot === i ? '#FFFFFF' : tappable ? C.tap : mine ? 'rgba(224,169,58,0.75)' : 'transparent' }}>
          <View style={{ flex: 1, borderRadius: 999, backgroundColor: C.bowl, borderWidth: 2, borderTopColor: '#8F5E2B', borderLeftColor: '#A8722F', borderBottomColor: '#F3CE98', borderRightColor: '#E3B880', padding: 3 }}>
            <View style={{ flex: 1, borderRadius: 999, backgroundColor: C.bowlIn, overflow: 'hidden' }}>
              {Array.from({ length: Math.min(n, 24) }).map((_, k) => {
                const p = seedSpot(k, pitSize);
                return <View key={k} style={{ position: 'absolute', width: seedSize, height: seedSize * 0.86, borderRadius: 999, borderWidth: 0.5, borderColor: 'rgba(60,60,50,0.35)', left: inner / 2 + p.x - seedSize / 2, top: inner / 2 + p.y - seedSize * 0.43, backgroundColor: SEEDS[k % SEEDS.length], transform: [{ rotate: `${(k * 53) % 180}deg` }] }} />;
              })}
            </View>
          </View>
        </View>
        <View style={{ position: 'absolute', right: -2, bottom: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: 'rgba(60,35,12,0.88)', alignItems: 'center', justifyContent: 'center', opacity: n === 0 ? 0.45 : 1 }}>
          <Text style={{ color: C.text, fontSize: 10, fontWeight: '900' }}>{n}</Text>
        </View>
      </Pressable>
    );
  };

  const label = !active ? 'GAME OVER' : animating ? `SOWING${hand ? ` · ${hand} IN HAND` : '…'}` : myTurn ? 'YOUR TURN — TAP A BOWL' : `${oppName.toUpperCase()} IS THINKING…`;
  const gain = s.last && s.last.captured > 0 && !animating ? `${s.last.seat === mySeat ? 'You' : 'They'} packed ${s.last.captured}!` : '';

  return (
    <View style={{ backgroundColor: C.panel, borderRadius: 22, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: C.text, fontWeight: '900', fontSize: 14 }}>{oppName}</Text>
          <Text style={{ color: C.muted, fontSize: 11 }}>packed <Text style={{ color: C.gold, fontWeight: '900', fontSize: 13 }}>{s.captured[opp]}</Text></Text>
        </View>
        <View style={{ backgroundColor: myTurn && !animating ? C.gold : C.surface, borderWidth: 1, borderColor: myTurn ? '#FFD36B' : C.border, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 }}>
          <Text style={{ color: myTurn && !animating ? C.onGold : C.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }}>{label}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'center' }} onLayout={(e) => setBoardW(e.nativeEvent.layout.width)}>
        <LinearGradient colors={['#EBC890', '#DEB377', '#E8C38A']} style={{ width: pitSize * 2 + 14 + 20 + 4 + 8, borderRadius: 16, padding: 10, borderWidth: 2, borderColor: C.woodEdge, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#6B4420', fontSize: 10, fontWeight: '900' }}>{oppName} ▼</Text>
            <Text style={{ color: '#6B4420', fontSize: 10, fontWeight: '900' }}>▲ You</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ flex: 1, gap: 6 }}>{leftCol.map(renderPit)}</View>
            <View style={{ flex: 1, gap: 6 }}>{rightCol.map(renderPit)}</View>
            <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: 'rgba(110,70,30,0.45)' }} />
            {[24, 70].map((top) => (
              <View key={top} pointerEvents="none" style={{ position: 'absolute', left: '50%', top: `${top}%`, width: 18, height: 28, marginLeft: -9, borderRadius: 3, backgroundColor: '#D2AC52', borderWidth: 1, borderColor: '#8F6F26', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 3 }}>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#7A6120' }} /><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#7A6120' }} />
              </View>
            ))}
          </View>
        </LinearGradient>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: C.muted, fontSize: 11, flex: 1 }}>You packed <Text style={{ color: C.gold, fontWeight: '900', fontSize: 15 }}>{s.captured[mySeat]}</Text> · first to 25</Text>
        {gain ? <Text style={{ color: '#7BE0A6', fontWeight: '800', fontSize: 12 }}>{gain}</Text> : null}
      </View>
    </View>
  );
}
