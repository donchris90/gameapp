import { HOME, LudoEngine, LudoState, YARD, legalTokens, ringSquare } from './ludo.engine';

const engine = new LudoEngine();
/** Dice that show the given values in order (init's first-player pick uses its own context). */
const dice = (...values: number[]) => { let i = 0; return { randomInt: () => values[i++] - 1 }; };
const mk = (tokens: number[][], turn = 0, phase: 'ROLL' | 'MOVE' = 'ROLL', d: number | null = null, extra: Partial<LudoState> = {}): LudoState =>
  ({ players: tokens.length, tokens, turn, phase, dice: d, sixes: 0, moves: 0, left: [], lastRoll: null, last: null, ...extra });
const yard = () => [YARD, YARD, YARD, YARD];
const err = (fn: () => unknown) => { try { fn(); return 'ok'; } catch (e: any) { return e.code ?? 'other'; } };

describe('Ludo engine', () => {
  it('starts with every token in the yard and a random first player', () => {
    const { state, turnSeat } = engine.init(4, { randomInt: () => 2 });
    expect(state.tokens).toEqual([yard(), yard(), yard(), yard()]);
    expect(turnSeat).toBe(2);
    expect(state.phase).toBe('ROLL');
    expect(() => engine.init(1, dice())).toThrow();
    expect(() => engine.init(5, dice())).toThrow();
  });

  it('seats two players on opposite sides of the board', () => {
    expect(ringSquare(0, 0)).toBe(0);
    expect(ringSquare(1, 0)).toBe(26);
    expect(ringSquare(0, 51)).toBeNull();
    expect(ringSquare(0, YARD)).toBeNull();
    expect(ringSquare(1, 30)).toBe(4); // wraps round the ring
  });

  it('needs a six to leave the yard, otherwise the turn passes on', () => {
    const r = engine.applyMove(mk([yard(), yard()]), 0, { action: 'roll' }, dice(3));
    expect(r.turnSeat).toBe(1);
    expect(r.state).toMatchObject({ turn: 1, phase: 'ROLL', lastRoll: { seat: 0, value: 3, skipped: 'NO_MOVE' } });
    const six = engine.applyMove(mk([yard(), yard()]), 0, { action: 'roll' }, dice(6));
    expect(six.turnSeat).toBe(0);
    expect(six.state).toMatchObject({ phase: 'MOVE', dice: 6 });
    const out = engine.applyMove(six.state, 0, { action: 'move', token: 2 }, dice());
    expect(out.state.tokens[0]).toEqual([YARD, YARD, 0, YARD]);
    expect(out.state.turn).toBe(0); // a six earns another roll
    expect(out.state.phase).toBe('ROLL');
  });

  it('passes the turn after an ordinary move and lets the same player go again after a six', () => {
    const start = mk([[10, YARD, YARD, YARD], yard()]);
    const r = engine.applyMove(start, 0, { action: 'roll' }, dice(4)); // only one token can move, so it is counted out automatically
    expect(r.state.tokens[0][0]).toBe(14);
    expect(r.state.lastRoll).toMatchObject({ value: 4 });
    expect(r.turnSeat).toBe(1);
    expect(r.state.moves).toBe(1);
  });

  it('waits for a choice when two tokens can move', () => {
    const start = mk([[10, 20, YARD, YARD], yard()]);
    const r = engine.applyMove(start, 0, { action: 'roll' }, dice(4));
    expect(r.state.phase).toBe('MOVE');
    expect(r.turnSeat).toBe(0);
    const m = engine.applyMove(r.state, 0, { action: 'move', token: 1 }, dice());
    expect(m.state.tokens[0][1]).toBe(24);
  });

  it('takes the turn away after three sixes in a row', () => {
    let s = mk([[5, YARD, YARD, YARD], yard()]);
    const d = dice(6, 6, 6);
    for (let i = 0; i < 2; i++) {
      let r = engine.applyMove(s, 0, { action: 'roll' }, d);
      if (r.state.phase === 'MOVE') r = engine.applyMove(r.state, 0, { action: 'move', token: 0 }, d); // a six also lets yard tokens out, so there is a choice
      expect(r.turnSeat).toBe(0);
      s = r.state;
      expect(s.sixes).toBe(i + 1);
    }
    const r = engine.applyMove(s, 0, { action: 'roll' }, d);
    expect(r.turnSeat).toBe(1);
    expect(r.state.lastRoll).toMatchObject({ value: 6, skipped: 'THREE_SIXES' });
    expect(r.state.tokens[0][0]).toBe(17); // two sixes moved it, the third did nothing
  });

  it('captures lone opponents on ordinary squares, sends them to the yard, and rolls again', () => {
    // seat 0 at progress 5 (square 5) rolls 5 -> square 10. Seat 1 progress 36 = square (26+36)%52 = 10.
    const s = mk([[5, YARD, YARD, YARD], [36, 40, YARD, YARD]], 0, 'MOVE', 5);
    const r = engine.applyMove(s, 0, { action: 'move', token: 0 }, dice());
    expect(r.state.tokens[1]).toEqual([YARD, 40, YARD, YARD]);
    expect(r.state.last?.captured).toEqual([{ seat: 1, token: 0 }]);
    expect(r.turnSeat).toBe(0);
  });

  it('cannot capture on safe squares', () => {
    // square 8 is a star. Seat 1 progress 34 -> (26+34)%52 = 8
    const s = mk([[3, YARD, YARD, YARD], [34, YARD, YARD, YARD]], 0, 'MOVE', 5);
    const r = engine.applyMove(s, 0, { action: 'move', token: 0 }, dice());
    expect(r.state.tokens[1][0]).toBe(34);
    expect(r.state.last?.captured).toEqual([]);
    expect(r.turnSeat).toBe(1); // no six, no capture
  });

  it('does not capture your own tokens, and tokens in the home column are untouchable', () => {
    const s = mk([[5, 10, YARD, YARD], [YARD, YARD, YARD, YARD]], 0, 'MOVE', 5);
    const r = engine.applyMove(s, 0, { action: 'move', token: 0 }, dice());
    expect(r.state.tokens[0]).toEqual([10, 10, YARD, YARD]);
    // seat 0 progress 52 is in its home column; ring square is null so no capture can happen there
    expect(ringSquare(0, 52)).toBeNull();
  });

  it('needs the exact number to get home, and a token home earns another roll', () => {
    expect(legalTokens({ tokens: [[54, 55, 53, YARD]] }, 0, 3)).toEqual([2]);
    expect(legalTokens({ tokens: [[56, 56, 56, 56]] }, 0, 1)).toEqual([]);
    const s = mk([[53, YARD, YARD, YARD], yard()], 0, 'MOVE', 3);
    const r = engine.applyMove(s, 0, { action: 'move', token: 0 }, dice());
    expect(r.state.tokens[0][0]).toBe(HOME);
    expect(r.turnSeat).toBe(0);
  });

  it('passes when the only roll would overshoot home', () => {
    const r = engine.applyMove(mk([[55, 56, 56, 56], yard()]), 0, { action: 'roll' }, dice(4));
    expect(r.turnSeat).toBe(1);
    expect(r.state.lastRoll?.skipped).toBe('NO_MOVE');
  });

  it('wins when all four tokens are home', () => {
    const s = mk([[56, 56, 56, 55], [20, YARD, YARD, YARD]], 0, 'MOVE', 1);
    const r = engine.applyMove(s, 0, { action: 'move', token: 3 }, dice());
    expect(r.outcome).toEqual({ type: 'WIN', winnerSeat: 0 });
    expect(r.turnSeat).toBeNull();
  });

  it('rejects out of turn, wrong phase, bad and impossible moves', () => {
    const rolled = mk([[5, YARD, YARD, YARD], yard()], 0, 'MOVE', 3);
    expect(err(() => engine.applyMove(rolled, 1, { action: 'roll' }, dice(1)))).toBe('NOT_YOUR_TURN');
    expect(err(() => engine.applyMove(rolled, 0, { action: 'roll' }, dice(1)))).toBe('MOVE_FIRST');
    expect(err(() => engine.applyMove(mk([yard(), yard()]), 0, { action: 'move', token: 0 }, dice()))).toBe('ROLL_FIRST');
    expect(err(() => engine.applyMove(rolled, 0, { action: 'move', token: 1 }, dice()))).toBe('ILLEGAL_TOKEN');
    expect(err(() => engine.applyMove(rolled, 0, { action: 'move', token: 4 }, dice()))).toBe('BAD_MOVE');
    expect(err(() => engine.applyMove(rolled, 0, { action: 'move', token: '0' }, dice()))).toBe('BAD_MOVE');
    expect(err(() => engine.applyMove(rolled, 0, { action: 'jump' }, dice()))).toBe('BAD_MOVE');
    expect(err(() => engine.applyMove(rolled, 0, null, dice()))).toBe('BAD_MOVE');
    expect(rolled.tokens[0][0]).toBe(5);
  });

  it('skips seats that have left, and clears their tokens', () => {
    const s = mk([[5, 6, 7, 8], [YARD, YARD, YARD, YARD], [9, 9, 9, 9]], 0, 'ROLL', null, { left: [1] });
    const r = engine.applyMove(s, 0, { action: 'roll' }, dice(2));
    const m = engine.applyMove(r.state, 0, { action: 'move', token: 0 }, dice());
    expect(m.turnSeat).toBe(2); // seat 1 is skipped
    const gone = engine.onSeatLeft(mk([[5, 6, 7, 8], [10, 10, 10, 10], [YARD, YARD, YARD, YARD]], 1), 1);
    expect(gone.state.tokens[1]).toEqual(yard());
    expect(gone.state.left).toEqual([1]);
    expect(gone.turnSeat).toBe(2); // it was their turn
    const other = engine.onSeatLeft(mk([[5, 6, 7, 8], [10, 10, 10, 10], yard()], 0), 1);
    expect(other.turnSeat).toBe(0); // someone else's turn is unaffected
  });

  it('shows the movable tokens and progress to clients', () => {
    const v: any = engine.publicState(mk([[56, 3, YARD, YARD], yard()], 0, 'MOVE', 2));
    expect(v.canMove).toEqual([1]);
    expect(v.home).toEqual([1, 0]);
    expect(v.startSquares).toEqual([0, 26]);
  });

  it('plays a whole random game to a winner with real dice', () => {
    const { randomInt } = require('crypto');
    const ctx = { randomInt: (n: number) => randomInt(n) };
    let { state } = engine.init(4, ctx), r: any;
    for (let i = 0; i < 20000; i++) {
      if (state.phase === 'ROLL') r = engine.applyMove(state, state.turn, { action: 'roll' }, ctx);
      else r = engine.applyMove(state, state.turn, { action: 'move', token: legalTokens(state, state.turn, state.dice!)[0] }, ctx);
      state = r.state;
      if (r.outcome) break;
    }
    expect(r.outcome?.type).toBe('WIN');
    expect(state.tokens[r.outcome.winnerSeat].every((p) => p === HOME)).toBe(true);
  });
});
