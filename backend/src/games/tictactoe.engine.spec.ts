import { IllegalMove } from './engine';
import { TicTacToeEngine, WIN_LINES, TicTacToeState } from './tictactoe.engine';

const engine = new TicTacToeEngine();
const ctx = (first: number) => ({ randomInt: () => first });

function play(first: number, cells: number[]) {
  let { state, turnSeat } = engine.init(2, ctx(first));
  let last: ReturnType<typeof engine.applyMove> | undefined;
  for (const cell of cells) {
    last = engine.applyMove(state, turnSeat!, { cell }, ctx(first));
    state = last.state;
    turnSeat = last.turnSeat;
  }
  return { state, last: last! };
}

describe('TicTacToeEngine', () => {
  it('starts with an empty board and the randomly chosen player on the clock', () => {
    for (const first of [0, 1]) {
      const { state, turnSeat } = engine.init(2, ctx(first));
      expect(state.board).toEqual(Array(9).fill(null));
      expect(turnSeat).toBe(first);
    }
  });

  it('picks both players as first mover across many real games', () => {
    const real = { randomInt: (n: number) => Math.floor(Math.random() * n) };
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(engine.init(2, real).turnSeat!);
    expect(seen).toEqual(new Set([0, 1]));
  });

  it('only supports two players', () => {
    expect(() => engine.init(3, ctx(0))).toThrow();
  });

  it('alternates turns', () => {
    const { state, last } = play(0, [4]);
    expect(last.turnSeat).toBe(1);
    expect(state.board[4]).toBe(0);
    expect(play(1, [4]).state.board[4]).toBe(1);
  });

  it.each(WIN_LINES.map((l) => [l.join('-'), l]))('detects a win on line %s', (_n, line) => {
    const mine = [...line];
    const others = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((c) => !mine.includes(c)).slice(0, 2);
    // first player takes the line, second plays two harmless cells
    const { last } = play(0, [mine[0], others[0], mine[1], others[1], mine[2]]);
    expect(last.outcome).toEqual({ type: 'WIN', winnerSeat: 0 });
    expect(last.state.winLine).toEqual(mine);
    expect(last.turnSeat).toBeNull();
  });

  it('lets the second player win too', () => {
    const { last } = play(0, [0, 3, 1, 4, 8, 5]); // seat 1 owns 3,4,5
    expect(last.outcome).toEqual({ type: 'WIN', winnerSeat: 1 });
  });

  it('calls a full board with no line a draw', () => {
    // X O X / X O O / O X X  -> no line
    const { last } = play(0, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
    expect(last.outcome).toEqual({ type: 'DRAW' });
    expect(last.state.moves).toBe(9);
  });

  it('a win on the ninth move is a win, not a draw', () => {
    // Final board  X O X / O X O / O X X  (X completes 0-4-8 with the very last move)
    const { last } = play(0, [2, 1, 7, 3, 0, 5, 4, 6, 8]);
    expect(last.state.moves).toBe(9);
    expect(last.outcome).toEqual({ type: 'WIN', winnerSeat: 0 });
    expect(last.state.winLine).toEqual([0, 4, 8]);
  });

  it('rejects illegal moves with a clear code', () => {
    const { state } = engine.init(2, ctx(0));
    const code = (m: unknown, seat = 0, s: TicTacToeState = state) => {
      try { engine.applyMove(s, seat, m, ctx(0)); } catch (e) { return (e as IllegalMove).code; }
      return 'OK';
    };
    expect(code({ cell: -1 })).toBe('BAD_MOVE');
    expect(code({ cell: 9 })).toBe('BAD_MOVE');
    expect(code({ cell: 1.5 })).toBe('BAD_MOVE');
    expect(code({ cell: '4' })).toBe('BAD_MOVE');
    expect(code({})).toBe('BAD_MOVE');
    expect(code(null)).toBe('BAD_MOVE');
    expect(code({ cell: 4 }, 1)).toBe('NOT_YOUR_TURN');
    const after = engine.applyMove(state, 0, { cell: 4 }, ctx(0)).state;
    expect(code({ cell: 4 }, 1, after)).toBe('CELL_TAKEN');
  });

  it('never mutates the state it was given', () => {
    const { state } = engine.init(2, ctx(0));
    const copy = JSON.parse(JSON.stringify(state));
    engine.applyMove(state, 0, { cell: 0 }, ctx(0));
    expect(state).toEqual(copy);
  });

  it('exposes the board and marks to clients', () => {
    const { state } = play(0, [4]);
    expect(engine.publicState(state)).toMatchObject({ marks: { 0: 'X', 1: 'O' }, board: expect.any(Array), moves: 1 });
  });
});
