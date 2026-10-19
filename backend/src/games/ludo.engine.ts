import { GameType } from '../generated/prisma/client';
import { EngineContext, GameEngine, IllegalMove, MoveResult } from './engine';

/** Token progress: -1 in the yard, 0 on the start square, 50 the last square of the ring, 51-55 the home column, 56 home. */
export const YARD = -1;
export const LAST_RING = 50;
export const HOME = 56;
export const RING = 52;
export const TOKENS = 4;

/** Where each seat sits round the board, so two players face each other. */
const POSITIONS = [0, 2, 1, 3];
const startSquare = (seat: number) => 13 * POSITIONS[seat];
/** Start squares and the star squares are safe: nobody can be captured there. */
const SAFE = new Set([0, 13, 26, 39, 8, 21, 34, 47]);
/** The ring square a token stands on, or null in the yard or on the home stretch. */
export const ringSquare = (seat: number, progress: number): number | null =>
  progress >= 0 && progress <= LAST_RING ? (startSquare(seat) + progress) % RING : null;

export interface LudoState {
  players: number;
  tokens: number[][];
  turn: number;
  /** ROLL: the player must roll. MOVE: they rolled `dice` and must pick a token. */
  phase: 'ROLL' | 'MOVE';
  dice: number | null;
  /** Sixes rolled in a row by the player on the clock. Three in a row loses the turn. */
  sixes: number;
  moves: number;
  left: number[];
  lastRoll: { seat: number; value: number; skipped?: 'NO_MOVE' | 'THREE_SIXES' } | null;
  /** Counts every roll so clients can tell two identical rolls apart and animate the dice. */
  rolls?: number;
  last: { seat: number; token: number; from: number; to: number; captured: Array<{ seat: number; token: number }> } | null;
}

export function legalTokens(state: Pick<LudoState, 'tokens'>, seat: number, dice: number): number[] {
  const out: number[] = [];
  state.tokens[seat].forEach((p, i) => {
    if (p === YARD ? dice === 6 : p + dice <= HOME) out.push(i);
  });
  return out;
}

/**
 * Ludo for 2-4 players. The server rolls the dice. Roll a 6 to leave the yard and to roll again; three sixes in a row
 * lose the turn. Landing on a lone ring square held by opponents sends their tokens back to the yard (not on safe squares),
 * and earns another turn, as does getting a token home. A token needs the exact number to finish. First to bring all four home wins.
 */
export class LudoEngine implements GameEngine<LudoState> {
  readonly game: GameType = 'LUDO';

  init(playerCount: number, ctx: EngineContext): { state: LudoState; turnSeat: number | null } {
    if (playerCount < 2 || playerCount > 4) throw new Error('Ludo is for 2 to 4 players');
    const first = ctx.randomInt(playerCount);
    return {
      state: {
        players: playerCount, tokens: Array.from({ length: playerCount }, () => Array(TOKENS).fill(YARD)),
        turn: first, phase: 'ROLL', dice: null, sixes: 0, moves: 0, left: [], lastRoll: null, last: null,
      },
      turnSeat: first,
    };
  }

  private nextSeat(state: LudoState, from: number): number {
    for (let i = 1; i <= state.players; i++) {
      const s = (from + i) % state.players;
      if (!state.left.includes(s)) return s;
    }
    return from;
  }

  applyMove(state: LudoState, seat: number, move: unknown, ctx: EngineContext): MoveResult<LudoState> {
    const m = (move ?? {}) as { action?: unknown; token?: unknown };
    if (m.action !== 'roll' && m.action !== 'move') throw new IllegalMove('BAD_MOVE', 'Send { action: "roll" } or { action: "move", token }');
    if (seat !== state.turn) throw new IllegalMove('NOT_YOUR_TURN', 'It is not your turn');
    return m.action === 'roll' ? this.roll(state, seat, ctx) : this.moveToken(state, seat, m.token);
  }

  private roll(state: LudoState, seat: number, ctx: EngineContext): MoveResult<LudoState> {
    if (state.phase !== 'ROLL') throw new IllegalMove('MOVE_FIRST', 'You already rolled: pick a token to move');
    const value = ctx.randomInt(6) + 1;
    const sixes = value === 6 ? state.sixes + 1 : 0;
    const pass = (skipped: 'NO_MOVE' | 'THREE_SIXES'): MoveResult<LudoState> => {
      const turn = this.nextSeat(state, seat);
      return { state: { ...state, turn, phase: 'ROLL', dice: null, sixes: 0, rolls: (state.rolls ?? 0) + 1, lastRoll: { seat, value, skipped } }, turnSeat: turn };
    };
    if (sixes >= 3) return pass('THREE_SIXES');
    if (legalTokens(state, seat, value).length === 0) return pass('NO_MOVE');
    const rolled: LudoState = { ...state, phase: 'MOVE', dice: value, sixes, rolls: (state.rolls ?? 0) + 1, lastRoll: { seat, value } };
    // Only one token can move: there is nothing to choose, so the server counts it out straight away.
    const only = legalTokens(rolled, seat, value);
    if (only.length === 1) {
      const res = this.moveToken(rolled, seat, only[0]);
      return { ...res, holdMs: (res.holdMs ?? 0) + 1400 };
    }
    return { state: rolled, turnSeat: seat };
  }

  private moveToken(state: LudoState, seat: number, token: unknown): MoveResult<LudoState> {
    if (state.phase !== 'MOVE' || state.dice === null) throw new IllegalMove('ROLL_FIRST', 'Roll the dice first');
    if (typeof token !== 'number' || !Number.isInteger(token) || token < 0 || token >= TOKENS) throw new IllegalMove('BAD_MOVE', 'Pick a token from 0 to 3');
    const dice = state.dice;
    if (!legalTokens(state, seat, dice).includes(token)) throw new IllegalMove('ILLEGAL_TOKEN', 'That token cannot move that far');

    const tokens = state.tokens.map((t) => t.slice());
    const from = tokens[seat][token];
    const to = from === YARD ? 0 : from + dice;
    tokens[seat][token] = to;

    const captured: Array<{ seat: number; token: number }> = [];
    const square = ringSquare(seat, to);
    if (square !== null && !SAFE.has(square)) {
      for (let s = 0; s < state.players; s++) {
        if (s === seat) continue;
        tokens[s].forEach((p, i) => { if (ringSquare(s, p) === square) { tokens[s][i] = YARD; captured.push({ seat: s, token: i }); } });
      }
    }

    const next: LudoState = {
      ...state, tokens, dice: null, moves: state.moves + 1,
      last: { seat, token, from, to, captured },
    };
    if (tokens[seat].every((p) => p === HOME)) {
      return { state: { ...next, phase: 'ROLL' }, turnSeat: null, outcome: { type: 'WIN', winnerSeat: seat } };
    }
    const again = dice === 6 || captured.length > 0 || to === HOME;
    if (again) return { state: { ...next, phase: 'ROLL' }, turnSeat: seat };
    const turn = this.nextSeat(state, seat);
    return { state: { ...next, turn, phase: 'ROLL', sixes: 0 }, turnSeat: turn };
  }

  /** A player left with two or more still playing: their tokens leave the board and the turn moves on if it was theirs. */
  onSeatLeft(state: LudoState, seat: number): MoveResult<LudoState> {
    const left = [...state.left, seat];
    const tokens = state.tokens.map((t, s) => (s === seat ? Array(TOKENS).fill(YARD) : t));
    let next: LudoState = { ...state, left, tokens };
    if (state.turn === seat) {
      const turn = this.nextSeat(next, seat);
      next = { ...next, turn, phase: 'ROLL', dice: null, sixes: 0 };
    }
    return { state: next, turnSeat: next.turn };
  }

  publicState(state: LudoState) {
    return {
      tokens: state.tokens, turn: state.turn, phase: state.phase, dice: state.dice,
      canMove: state.phase === 'MOVE' && state.dice !== null ? legalTokens(state, state.turn, state.dice) : [],
      moves: state.moves, rolls: state.rolls ?? 0, left: state.left, lastRoll: state.lastRoll, last: state.last,
      home: state.tokens.map((t) => t.filter((p) => p === HOME).length),
      startSquares: Array.from({ length: state.players }, (_, s) => startSquare(s)),
      ring: RING,
    };
  }
}
