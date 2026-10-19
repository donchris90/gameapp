import { AyoEngine, AyoState, legalMoves, ownersFor } from './ayo.engine';

const engine = new AyoEngine();
const ctx = { randomInt: () => 0 };
const mk = (pits: number[], extra: Partial<AyoState> = {}): AyoState =>
  ({ pits, owners: ownersFor(6), captured: [0, 0], turn: 0, moves: 0, round: 1, roundTurns: 0, lastPacker: null, roundStarter: 0, decision: null, last: null, lastRound: null, ...extra });
const play = (s: AyoState, pit: number) => engine.applyMove(s, s.turn, { pit }, ctx);
const code = (s: AyoState, seat: number, move: unknown) => { try { engine.applyMove(s, seat, move, ctx); return 'ok'; } catch (e: any) { return e.code ?? 'other'; } };

describe('Ayo engine (relay sowing)', () => {
  it('starts with four seeds in every pit and a random first player', () => {
    const { state, turnSeat } = engine.init(2, { randomInt: () => 1 });
    expect(state.pits).toEqual(Array(12).fill(4));
    expect(state.owners).toEqual(ownersFor(6));
    expect(turnSeat).toBe(1);
    expect(() => engine.init(3, ctx)).toThrow();
  });

  it('keeps sowing when the last seed lands in a pit that has seeds, and stops in an empty pit', () => {
    const r = play(mk([1, 1, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5]), 0);
    expect(r.state.pits).toEqual([0, 0, 1, 1, 0, 0, 5, 5, 5, 5, 5, 5]);
    expect(r.turnSeat).toBe(1);
    expect(r.state.last!.events.filter((e) => e.t === 'pick')).toHaveLength(2);
  });

  it('lets the sower pack a pit their last seed makes four, on either side', () => {
    const r = play(mk([0, 0, 0, 0, 0, 1, 3, 5, 5, 5, 5, 5]), 5);
    expect(r.state.captured).toEqual([4, 0]);
    expect(r.state.pits[6]).toBe(0);
    expect(r.turnSeat).toBe(1);
  });

  it('gives a pit that hits four mid-sow to its owner', () => {
    const r = play(mk([0, 0, 0, 0, 0, 2, 3, 0, 5, 5, 5, 5]), 5);
    expect(r.state.captured).toEqual([0, 4]);
    expect(r.state.pits.slice(6, 8)).toEqual([0, 1]);
  });

  it('always keeps 48 seeds on the table over a whole random game', () => {
    let { state, turnSeat } = engine.init(2, ctx);
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let i = 0; i < 3000 && turnSeat !== null; i++) {
      const seat: number = turnSeat;
      const move = state.decision ? { decision: 'continue' } : { pit: legalMoves(state.pits, seat, state.owners).sort(() => rnd(3) - 1)[0] };
      const r = engine.applyMove(state, seat, move, ctx);
      state = r.state; turnSeat = r.turnSeat;
      expect(state.pits.reduce((a, b) => a + b, 0) + state.captured[0] + state.captured[1]).toBe(48);
      if (r.outcome) break;
    }
  });

  it('starts the next round from what each player packed, and alternates the starter', () => {
    const r = play(mk([0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0], { captured: [24, 20] }), 5);
    expect(r.outcome).toBeUndefined();
    expect(r.state.round).toBe(2);
    expect(r.state.owners).toEqual(ownersFor(7));
    expect(r.state.pits).toEqual(Array(12).fill(4));
    expect(r.state.captured).toEqual([0, 0]);
    expect(r.turnSeat).toBe(1);
  });

  it('gives a player with exactly two pits the choice to quit or continue', () => {
    const r = play(mk([0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0], { captured: [40, 4] }), 5);
    // 44 vs 4: seat 1 has one pit and has lost
    expect(r.outcome).toEqual({ type: 'WIN', winnerSeat: 0 });

    const two = play(mk([0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0], { captured: [36, 8] }), 5); // 40 vs 8 -> 10 pits vs 2
    expect(two.outcome).toBeUndefined();
    expect(two.state.decision).toEqual({ seat: 1 });
    expect(two.turnSeat).toBe(1);
    expect(code(two.state, 0, { pit: 0 })).toBe('NOT_YOUR_TURN');
    expect(engine.applyMove(two.state, 1, { decision: 'quit' }, ctx).outcome).toEqual({ type: 'WIN', winnerSeat: 0 });
    const cont = engine.applyMove(two.state, 1, { decision: 'continue' }, ctx);
    expect(cont.outcome).toBeUndefined();
    expect(cont.state.decision).toBeNull();
    expect(cont.turnSeat).toBe(two.state.turn);
  });

  it('rejects illegal moves', () => {
    const s = mk([0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(code(s, 1, { pit: 6 })).toBe('NOT_YOUR_TURN');
    expect(code(s, 0, { pit: 7 })).toBe('NOT_YOUR_PIT');
    expect(code(s, 0, { pit: 0 })).toBe('EMPTY_PIT');
    expect(code(s, 0, { pit: 99 })).toBe('BAD_MOVE');
    expect(code(s, 0, {})).toBe('BAD_MOVE');
  });
});
