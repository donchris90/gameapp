import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Match } from '../types';
import { sfx } from '../sfx';

type Ev = { t: 'pick'; pit: number; count: number } | { t: 'drop'; pit: number } | { t: 'pack'; pit: number; seat: number } | { t: 'final'; seat: number; seeds: number } | { t: 'round'; round: number };
interface State {
  pits: number[]; owners: number[]; captured: [number, number]; turn: number; moves: number; round: number; decision: { seat: number } | null;
  last: { seat: number; pit: number; packed: number; before: number[]; ownersBefore: number[]; capturedBefore: [number, number]; events: Ev[] } | null;
}
type View_ = { board: number[]; owners: number[]; captured: [number, number] };

// Dark wood + gold table from the reference app's Ayo screen.
const C = {
  text: '#FFF4E2', muted: '#CDB898', gold: '#F5B841', onGold: '#2A1505', border: 'rgba(255,214,150,0.16)', surface: 'rgba(255,232,190,0.10)',
  woodEdge: '#B98A4F', bowl: '#C99456', bowlIn: '#B07A3E', tap: '#2F9E5B',
};
const SEEDS = ['#C9CFC8', '#DAD6C8', '#B9C0B4', '#E4DECF', '#C2C6BD', '#D3CFC0'];
const seedSpot = (k: number, pit: number) => { const r = pit * 0.085 * Math.sqrt(k + 0.4); const a = k * 2.399963; return { x: r * Math.cos(a), y: r * Math.sin(a) }; };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const truth = (s: State): View_ => ({ board: s.pits.slice(), owners: s.owners.slice(), captured: [s.captured[0], s.captured[1]] });
const DROP_MS = 220, PICK_MS = 320, PACK_MS = 600, FINAL_MS = 800, ROUND_MS = 1800, MAX_MS = 9000;

/**
 * Two columns of six bowls, drawn to fit the space it is given (no scrolling). Sowing runs UP your column (right) and DOWN
 * your opponent's (left). Every move, yours or theirs, is replayed seed by seed (including the relay), then the board snaps to the server's truth.
 */
export function Ayo({ match, mySeat, onMove, busy, height }: { match: Match<State>; mySeat: number; onMove: (move: object) => void; busy: boolean; height: number }) {
  const s = match.state;
  const [view, setView] = useState<View_>(() => truth(s));
  const [hot, setHot] = useState<number | null>(null);
  const [hand, setHand] = useState(0);
  const [banner, setBanner] = useState('');
  const [animating, setAnimating] = useState(false);
  const seen = useRef(s.moves);
  const run = useRef(0);
  const alive = useRef(true);
  const latest = useRef(s); latest.current = s;
  useEffect(() => { alive.current = true; return () => { alive.current = false; run.current++; }; }, []);

  useEffect(() => {
    const last = s.last;
    const isNew = s.moves === seen.current + 1 && !!last && last.events.length > 0 && last.before.length === 12;
    seen.current = s.moves;
    if (!isNew) { run.current++; setView(truth(s)); setHot(null); setHand(0); setBanner(''); setAnimating(false); return; }
    const id = ++run.current;
    (async () => {
      setAnimating(true);
      let board = last!.before.slice();
      let owners = last!.ownersBefore.slice();
      const captured: [number, number] = [last!.capturedBefore[0], last!.capturedBefore[1]];
      const show = () => setView({ board: board.slice(), owners: owners.slice(), captured: [captured[0], captured[1]] });
      const drops = last!.events.filter((e) => e.t === 'drop').length;
      const dropMs = drops > 0 ? Math.min(DROP_MS, Math.floor(MAX_MS / drops)) : DROP_MS;
      show();
      for (const e of last!.events) {
        if (!alive.current || run.current !== id) return;
        if (e.t === 'pick') { board[e.pit] = 0; setHand(e.count); setHot(e.pit); sfx('tap'); show(); await sleep(PICK_MS); }
        else if (e.t === 'drop') { board[e.pit] += 1; setHand((h) => Math.max(0, h - 1)); setHot(e.pit); sfx('drop'); show(); await sleep(dropMs); }
        else if (e.t === 'pack') { board[e.pit] = 0; captured[e.seat] += 4; sfx('pack'); show(); await sleep(PACK_MS); }
        else if (e.t === 'final') { board = Array(12).fill(0); captured[e.seat] += e.seeds; sfx('pack'); show(); await sleep(FINAL_MS); }
        else if (e.t === 'round') { const t = truth(latest.current); board = t.board; owners = t.owners; captured[0] = t.captured[0]; captured[1] = t.captured[1]; setBanner(`Round ${e.round}`); sfx('round'); show(); await sleep(ROUND_MS); setBanner(''); }
      }
    })().finally(() => {
      if (alive.current && run.current === id) { setView(truth(latest.current)); setHot(null); setHand(0); setBanner(''); setAnimating(false); }
    });
  }, [s.moves]);

  const opp = 1 - mySeat;
  const active = match.status === 'ACTIVE';
  const myTurn = active && match.turnSeat === mySeat;
  const deciding = active && !!s.decision && s.decision.seat === mySeat && !animating;
  const canTap = myTurn && !s.decision && !busy && !animating;
  const oppName = match.players.find((p) => p.seat === opp)?.displayName ?? 'Opponent';
  const pitsOf = (seat: number) => view.owners.filter((o) => o === seat).length;
  // Sowing runs up my column (right) and down the opponent's (left).
  const rightCol = mySeat === 0 ? [5, 4, 3, 2, 1, 0] : [11, 10, 9, 8, 7, 6];
  const leftCol = mySeat === 0 ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5];

  // Size the bowls from the room we were given: top bar + board chrome + bottom bar take about 130px.
  const pitSize = Math.max(34, Math.min(70, Math.floor((height - 130) / 6.3)));
  const seedSize = Math.max(5, Math.round(pitSize * 0.23));
  const inner = pitSize - 18;

  // A plain function, not a nested component: the screen re-renders every second for the clock, and a nested
  // component would be re-created each time, which swallows taps.
  const renderPit = (i: number) => {
    const n = view.board[i];
    const mine = view.owners[i] === mySeat;
    const tappable = canTap && mine && n > 0;
    return (
      <Pressable key={i} disabled={!tappable} hitSlop={3}
        onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} sfx('tap'); onMove({ pit: i }); }}
        style={{ width: pitSize, height: pitSize, alignSelf: 'center', transform: [{ scale: hot === i ? 1.08 : 1 }] }}>
        <View style={{ flex: 1, borderRadius: 999, borderWidth: 2, padding: 1, borderColor: hot === i ? '#FFFFFF' : tappable ? C.tap : mine ? 'rgba(224,169,58,0.75)' : 'transparent' }}>
          <View style={{ flex: 1, borderRadius: 999, backgroundColor: C.bowl, borderWidth: 2, borderTopColor: '#8F5E2B', borderLeftColor: '#A8722F', borderBottomColor: '#F3CE98', borderRightColor: '#E3B880', padding: 2 }}>
            <View style={{ flex: 1, borderRadius: 999, backgroundColor: C.bowlIn, overflow: 'hidden' }}>
              {Array.from({ length: Math.min(n, 24) }).map((_, k) => {
                const p = seedSpot(k, pitSize);
                return <View key={k} style={{ position: 'absolute', width: seedSize, height: seedSize * 0.86, borderRadius: 999, borderWidth: 0.5, borderColor: 'rgba(60,60,50,0.35)', left: inner / 2 + p.x - seedSize / 2, top: inner / 2 + p.y - seedSize * 0.43, backgroundColor: SEEDS[k % SEEDS.length], transform: [{ rotate: `${(k * 53) % 180}deg` }] }} />;
              })}
            </View>
          </View>
        </View>
        <View style={{ position: 'absolute', right: -2, bottom: -2, minWidth: 17, height: 17, paddingHorizontal: 3, borderRadius: 9, backgroundColor: 'rgba(60,35,12,0.88)', alignItems: 'center', justifyContent: 'center', opacity: n === 0 ? 0.45 : 1 }}>
          <Text style={{ color: C.text, fontSize: 10, fontWeight: '900' }}>{n}</Text>
        </View>
      </Pressable>
    );
  };

  const label = !active ? 'GAME OVER' : banner ? banner.toUpperCase() : animating ? `SOWING${hand ? ` · ${hand} IN HAND` : '…'}` : s.decision ? (deciding ? 'YOUR CHOICE' : 'DECIDING…') : myTurn ? 'YOUR TURN' : `${oppName.toUpperCase()}…`;
  const hi = myTurn && !animating && !s.decision;

  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: C.text, fontWeight: '900', fontSize: 14 }}>{oppName}</Text>
          <Text style={{ color: C.muted, fontSize: 11 }}>{pitsOf(opp)} bowls · packed <Text style={{ color: C.gold, fontWeight: '900', fontSize: 13 }}>{view.captured[opp]}</Text></Text>
        </View>
        <View style={{ backgroundColor: hi ? C.gold : C.surface, borderWidth: 1, borderColor: hi ? '#FFD36B' : C.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 }}>
          <Text style={{ color: hi ? C.onGold : C.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }}>{label}</Text>
        </View>
      </View>

      <View style={{ alignItems: 'center' }}>
        <LinearGradient colors={['#EBC890', '#DEB377', '#E8C38A']} style={{ width: pitSize * 2 + 62, borderRadius: 16, padding: 9, borderWidth: 2, borderColor: C.woodEdge, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#6B4420', fontSize: 9, fontWeight: '900' }}>{oppName} ▼</Text>
            <Text style={{ color: '#6B4420', fontSize: 9, fontWeight: '900' }}>ROUND {s.round}</Text>
            <Text style={{ color: '#6B4420', fontSize: 9, fontWeight: '900' }}>▲ You</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ flex: 1, gap: 4 }}>{leftCol.map(renderPit)}</View>
            <View style={{ flex: 1, gap: 4 }}>{rightCol.map(renderPit)}</View>
            <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: 'rgba(110,70,30,0.45)' }} />
            {[24, 70].map((top) => (
              <View key={top} pointerEvents="none" style={{ position: 'absolute', left: '50%', top: `${top}%`, width: 16, height: 24, marginLeft: -8, borderRadius: 3, backgroundColor: '#D2AC52', borderWidth: 1, borderColor: '#8F6F26', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 3 }}>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#7A6120' }} /><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#7A6120' }} />
              </View>
            ))}
          </View>
        </LinearGradient>
        {deciding ? (
          <View style={{ position: 'absolute', left: 8, right: 8, top: '30%', backgroundColor: '#2A1A0C', borderRadius: 18, borderWidth: 1, borderColor: C.gold, padding: 14, gap: 8 }}>
            <Text style={{ color: C.gold, fontWeight: '900', fontSize: 15 }}>You have only two bowls left</Text>
            <Text style={{ color: C.text, fontSize: 12, lineHeight: 17 }}>Quit and your opponent wins, or keep playing.</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable disabled={busy} onPress={() => onMove({ decision: 'quit' })} style={{ flex: 1, padding: 12, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(255,122,92,0.2)', borderWidth: 1, borderColor: '#FF7A5C' }}><Text style={{ color: C.text, fontWeight: '900' }}>Quit</Text></Pressable>
              <Pressable disabled={busy} onPress={() => onMove({ decision: 'continue' })} style={{ flex: 1, padding: 12, borderRadius: 14, alignItems: 'center', backgroundColor: C.gold }}><Text style={{ color: C.onGold, fontWeight: '900' }}>Continue</Text></Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: C.muted, fontSize: 11, flex: 1 }}>You · {pitsOf(mySeat)} bowls · packed <Text style={{ color: C.gold, fontWeight: '900', fontSize: 14 }}>{view.captured[mySeat]}</Text></Text>
        {s.decision && !deciding && active ? <Text style={{ color: C.muted, fontSize: 11 }}>Waiting for a choice…</Text> : null}
      </View>
    </View>
  );
}
