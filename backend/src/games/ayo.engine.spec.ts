import { AyoEngine, AyoState, legalMoves } from './ayo.engine';

const engine = new AyoEngine();
const ctx = { randomInt: () => 0 };
const mk = (pits: number[], turn = 0, captured: [number, number] = [0, 0], extra: Partial<AyoState> = {}): AyoState =>
  ({ pits, captured, turn, moves: 0, sinceCapture: 0, last: null, ...extra });
const play = (s: AyoState, pit: number) => engine.applyMove(s, s.turn, { pit }, ctx);
const code = (s: AyoState, seat: number, move: unknown) => { try { engine.applyMove(s, seat, move, ctx); return 'ok'; } catch (e: any) { return e.code ?? 'other'; } };

describe('Ayo engine', () => {
  it('starts with four seeds in every pit and a random first player', () => {
    const { state, turnSeat } = engine.init(2, { randomInt: () => 1 });
    expect(state.pits).toEqual(Array(12).fill(4));
    expect(turnSeat).toBe(1);
    expect(() => engine.init(3, ctx)).toThrow();
  });

  it('sows one seed per pit round the board, counting 48 seeds always', () => {
    const r = play(mk(Array(12).fill(4)), 2);
    expect(r.state.pits).toEqual([4, 4, 0, 5, 5, 5, 5, 4, 4, 4, 4, 4]);
    expect(r.turnSeat).toBe(1);
    expect(r.state.pits.reduce((a, b) => a + b, 0) + r.state.captured[0] + r.state.captured[1]).toBe(48);
  });

  it('skips the starting pit on a lap of twelve or more', () => {
    const pits = Array(12).fill(1); pits[0] = 12;
    const r = play(mk(pits), 0);
    expect(r.state.pits[0]).toBe(0);
    expect(r.state.pits.slice(1)).toEqual([3, ...Array(10).fill(2)]); // 12 seeds over 11 pits: the first gets two
  });

  it('captures a pit that ends on 2 or 3 and chains backwards', () => {
    // seat 0 plays pit 5 (2 seeds) -> lands pit 7. Pits 6 and 7 hold 1,2 before => 2,3 after: both taken.
    const pits = [0, 0, 0, 0, 0, 2, 1, 2, 5, 0, 0, 0];
    const r = play(mk(pits), 5);
    expect(r.state.captured).toEqual([5, 0]);
    expect(r.state.pits.slice(6, 8)).toEqual([0, 0]);
    expect(r.state.last).toMatchObject({ seat: 0, pit: 5, endPit: 7, captured: 5 });
  });

  it('stops the chain at a pit that is not 2 or 3, and never captures from your own row', () => {
    const pits = [0, 0, 0, 0, 2, 1, 1, 6, 1, 0, 0, 0]; // seat 0 pit 5 (1 seed) -> pit 6 becomes 2 : capture 2 only
    const r = play(mk(pits), 5);
    expect(r.state.captured[0]).toBe(2);
    const own = play(mk([0, 0, 0, 1, 1, 0, 3, 3, 0, 0, 0, 0]), 3); // lands in own pit 4 = 2: no capture
    expect(own.state.captured).toEqual([0, 0]);
  });

  it('a move that would take every seed on the opponent row captures nothing', () => {
    const pits = [1, 0, 0, 0, 0, 1, 1, 2, 0, 0, 0, 0]; // pit 5 -> pit 6 becomes 2; opponent row total 4, so 2 taken is fine
    const partial = play(mk(pits), 5);
    expect(partial.state.captured[0]).toBe(2);
    const all = [1, 0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0]; // pit 5 sows 6,7: 2 and 2, both captured would be everything
    const r = play(mk(all, 0, [0, 0]), 5);
    expect(r.state.captured).toEqual([0, 0]);
    expect(r.state.pits.slice(6, 8)).toEqual([2, 2]);
  });

  it('wins at 25 captured', () => {
    const pits = [0, 0, 0, 0, 0, 2, 1, 2, 5, 0, 0, 0];
    const r = play(mk(pits, 0, [20, 0]), 5);
    expect(r.outcome).toEqual({ type: 'WIN', winnerSeat: 0 });
    expect(r.turnSeat).toBeNull();
  });

  it('forces you to feed an opponent with no seeds', () => {
    const pits = [1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0]; // pit 0 cannot reach them; pit 5 (3 seeds) can
    expect(legalMoves(pits, 0)).toEqual([5]);
    expect(code(mk(pits), 0, { pit: 0 })).toBe('MUST_FEED');
    expect(code(mk(pits), 0, { pit: 5 })).toBe('ok');
  });

  it('ends the game when the opponent cannot be fed: each side keeps its own seeds', () => {
    // seat 0 plays its only seeds across; seat 1 then has seeds but nothing that can reach seat 0's empty row.
    const pits = [0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0];
    const r = play(mk(pits, 0, [10, 34]), 5);
    expect(r.outcome).toEqual({ type: 'WIN', winnerSeat: 1 });
    expect(r.state.captured).toEqual([10, 38]);
    expect(r.state.pits).toEqual(Array(12).fill(0));
  });

  it('draws when a stalled game leaves both on 24', () => {
    const r = play(mk(Array(12).fill(4), 0, [0, 0], { sinceCapture: 119 }), 0);
    expect(r.outcome).toEqual({ type: 'DRAW' });
    expect(r.state.captured).toEqual([24, 24]);
  });

  it('ends a game that stalls with no captures', () => {
    const r = play(mk(Array(12).fill(4), 0, [0, 0], { sinceCapture: 119 }), 0);
    expect(r.outcome).toBeDefined();
    expect(r.state.captured[0] + r.state.captured[1]).toBe(48);
  });

  it('rejects bad, out of turn, wrong row and empty moves', () => {
    const s = mk([0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(code(s, 0, { pit: 12 })).toBe('BAD_MOVE');
    expect(code(s, 0, { pit: '1' })).toBe('BAD_MOVE');
    expect(code(s, 0, null)).toBe('BAD_MOVE');
    expect(code(s, 1, { pit: 7 })).toBe('NOT_YOUR_TURN');
    expect(code(s, 0, { pit: 7 })).toBe('NOT_YOUR_PIT');
    expect(code(s, 0, { pit: 0 })).toBe('EMPTY_PIT');
    expect(s.pits[1]).toBe(4); // untouched
  });

  it('always keeps 48 seeds across a long random game', () => {
    let s = engine.init(2, { randomInt: () => 0 }).state, r: any;
    let seed = 12345;
    for (let i = 0; i < 600; i++) {
      const moves = legalMoves(s.pits, s.turn);
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      r = play(s, moves[seed % moves.length]);
      s = r.state;
      expect(s.pits.reduce((a, b) => a + b, 0) + s.captured[0] + s.captured[1]).toBe(48);
      if (r.outcome) break;
    }
    expect(r.outcome).toBeDefined();
  });
});
