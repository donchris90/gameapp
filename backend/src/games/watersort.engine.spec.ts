import { randomInt } from 'crypto';
import { solve } from '../../test/water-solver';
import { IllegalMove } from './engine';
import { COLOR_COUNT, EMPTY_TUBES, TUBE_CAPACITY, WaterSortEngine, generatePuzzle, isSolved, progress } from './watersort.engine';

const ctx = { randomInt: (n: number) => randomInt(n) };
const engine = new WaterSortEngine();

describe('Water Sort puzzle generator', () => {
  it('always has the right units: each colour fills exactly one tube worth, plus empty tubes', () => {
    for (let i = 0; i < 20; i++) {
      const tubes = generatePuzzle(ctx);
      expect(tubes).toHaveLength(COLOR_COUNT + EMPTY_TUBES);
      const counts = new Map<number, number>();
      for (const t of tubes) {
        expect(t.length).toBeLessThanOrEqual(TUBE_CAPACITY);
        for (const c of t) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      expect([...counts.keys()].sort()).toEqual([...Array(COLOR_COUNT).keys()]);
      for (const n of counts.values()) expect(n).toBe(TUBE_CAPACITY);
    }
  });

  it('is shuffled, and is solvable by the normal pour rules', () => {
    for (let i = 0; i < 25; i++) {
      const tubes = generatePuzzle(ctx);
      expect(isSolved(tubes)).toBe(false);
      expect(progress(tubes)).toBe(0);
      expect(solve(tubes)).not.toBeNull();
    }
  });

  it('is deterministic for a given random source', () => {
    const seq = (seed: number) => { let s = seed; return { randomInt: (n: number) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; } }; };
    expect(generatePuzzle(seq(7))).toEqual(generatePuzzle(seq(7)));
  });
});

describe('Water Sort engine', () => {
  const fresh = (players = 2) => engine.init(players, ctx).state;

  it('gives every player the same starting puzzle and no turns', () => {
    const { state, turnSeat } = engine.init(3, ctx);
    expect(turnSeat).toBeNull();
    expect(state.boards).toHaveLength(3);
    expect(state.boards[1]).toEqual(state.boards[0]);
    expect(state.boards[2]).toEqual(state.tubes);
  });

  it('plays a full game by following a solution, and the finisher wins', () => {
    let state = fresh();
    const path = solve(state.tubes)!;
    let res: any;
    for (const [from, to] of path) res = engine.applyMove(state, 1, { from, to }, ctx), (state = res.state);
    expect(res.outcome).toEqual({ type: 'WIN', winnerSeat: 1 });
    expect(state.solvedBy).toBe(1);
    expect(state.moves[1]).toBe(path.length);
    expect(isSolved(state.boards[1])).toBe(true);
    expect(isSolved(state.boards[0])).toBe(false); // the other board is untouched
  });

  it('rejects illegal pours without changing the state', () => {
    const state = fresh();
    const snapshot = JSON.stringify(state);
    const codeOf = (move: unknown, seat = 0) => { try { engine.applyMove(state, seat, move, ctx); return 'ok'; } catch (e) { return e instanceof IllegalMove ? e.code : 'other'; } };
    const empty = state.tubes.findIndex((t) => t.length === 0);
    const full = state.tubes.findIndex((t) => t.length === TUBE_CAPACITY);
    expect(codeOf({ from: empty, to: full })).toBe('EMPTY_TUBE');
    expect(codeOf({ from: 0, to: 0 })).toBe('BAD_MOVE');
    expect(codeOf({ from: -1, to: 0 })).toBe('BAD_MOVE');
    expect(codeOf({ from: 0, to: 99 })).toBe('BAD_MOVE');
    expect(codeOf({ from: '0', to: 1 })).toBe('BAD_MOVE');
    expect(codeOf(null)).toBe('BAD_MOVE');
    expect(codeOf({ from: 0, to: 1 }, 5)).toBe('BAD_MOVE'); // no such seat
    // two full tubes of different colours: second is full
    const a = state.tubes.findIndex((t) => t.length === TUBE_CAPACITY);
    const b = state.tubes.findIndex((t, i) => i !== a && t.length === TUBE_CAPACITY);
    expect(codeOf({ from: a, to: b })).toBe('TUBE_FULL');
    // colour mismatch: find a pair of non-empty, non-full tubes with different tops
    const open = state.tubes.map((t, i) => i).filter((i) => state.tubes[i].length > 0 && state.tubes[i].length < TUBE_CAPACITY);
    for (const i of open) for (const j of open) if (i !== j && state.tubes[i].at(-1) !== state.tubes[j].at(-1)) { expect(codeOf({ from: i, to: j })).toBe('COLOUR_MISMATCH'); }
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('pours the whole top run as far as it fits', () => {
    const board = [[1, 2, 2, 2], [2], [], [1, 1, 1, 1], [0, 0, 0], [0]];
    const state = { tubes: board, boards: [board], moves: [0], solvedBy: null } as any;
    const r = engine.applyMove(state, 0, { from: 0, to: 1 }, ctx);
    expect(r.state.boards[0][0]).toEqual([1]); // all three 2s fit on the tube that held one
    expect(r.state.boards[0][1]).toEqual([2, 2, 2, 2]);
    const r2 = engine.applyMove(state, 0, { from: 4, to: 5 }, ctx);
    expect(r2.state.boards[0][4]).toEqual([]);
    expect(r2.state.boards[0][5]).toEqual([0, 0, 0, 0]);
  });

  it('ends on time by progress: most finished tubes wins, a tie is a draw', () => {
    const state = fresh(3);
    const solved = [0, 0, 0, 0];
    state.boards[2] = state.boards[2].map((t) => t.slice());
    state.boards[2][0] = solved; // seat 2 has one finished tube
    expect(engine.onDeadline(state, [0, 1, 2]).outcome).toEqual({ type: 'WIN', winnerSeat: 2 });
    expect(engine.onDeadline(state, [0, 1]).outcome).toEqual({ type: 'DRAW' });
  });

  it('shows everyone the boards and progress', () => {
    const view: any = engine.publicState(fresh(2));
    expect(view).toMatchObject({ capacity: TUBE_CAPACITY, finished: [0, 0], moves: [0, 0], solvedBy: null });
    expect(view.boards).toHaveLength(2);
  });
});
