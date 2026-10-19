import { GameType } from '../generated/prisma/client';
import { EngineContext, GameEngine, IllegalMove, MoveResult, Outcome } from './engine';

export const TUBE_CAPACITY = 4;
export const COLOR_COUNT = 7;
export const EMPTY_TUBES = 2;
export const WATER_SORT_TIME_MS = 5 * 60_000;

export interface WaterSortState {
  /** Each tube listed bottom to top; numbers are colours 0..COLOR_COUNT-1. */
  tubes: number[][];
  /** Every player gets their own copy of the same starting puzzle, indexed by seat. */
  boards: number[][][];
  moves: number[];
  /** Seat that solved it first. */
  solvedBy: number | null;
}

const topRun = (tube: number[]) => {
  if (tube.length === 0) return 0;
  const c = tube[tube.length - 1];
  let n = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === c; i--) n++;
  return n;
};

export const isTubeDone = (t: number[]) => t.length === TUBE_CAPACITY && t.every((c) => c === t[0]);
export const isSolved = (tubes: number[][]) => tubes.every((t) => t.length === 0 || isTubeDone(t));
export const progress = (tubes: number[][]) => tubes.filter(isTubeDone).length;

/**
 * Builds a puzzle that is always solvable: start from the solved position and apply random
 * reverse pours, each of which a normal pour can undo. Same rules as the live game:
 * a pour moves the whole top run of one colour onto an empty tube or the same colour, as far as it fits.
 */
export function generatePuzzle(ctx: EngineContext): number[][] {
  for (let attempt = 0; attempt < 20; attempt++) {
    const tubes: number[][] = [];
    for (let c = 0; c < COLOR_COUNT; c++) tubes.push(Array(TUBE_CAPACITY).fill(c));
    for (let i = 0; i < EMPTY_TUBES; i++) tubes.push([]);

    for (let step = 0; step < 250; step++) {
      const options: Array<[number, number, number]> = []; // [tube B to take from, tube A to give to, k]
      for (let b = 0; b < tubes.length; b++) {
        const run = topRun(tubes[b]);
        for (let k = 1; k <= run; k++) {
          // A pour could only have left B holding the same colour on top, or nothing.
          if (!(k < run || tubes[b].length === k)) continue;
          for (let a = 0; a < tubes.length; a++) {
            if (a === b) continue;
            const c = tubes[b][tubes[b].length - 1];
            const aTop = tubes[a][tubes[a].length - 1];
            if (tubes[a].length + k > TUBE_CAPACITY) continue;
            if (aTop === c) continue; // the pour back would carry more than k
            options.push([b, a, k]);
          }
        }
      }
      if (options.length === 0) break;
      const [b, a, k] = options[ctx.randomInt(options.length)];
      const moved = tubes[b].splice(tubes[b].length - k, k);
      tubes[a].push(...moved);
    }
    if (!tubes.some(isTubeDone) || attempt === 19) return tubes;
  }
  throw new Error('unreachable');
}

/**
 * Water Sort: one player solves a puzzle against the clock (the app uses it solo). The engine also supports a race: every player solves the same puzzle at once and the first to finish wins.
 * Not turn based. If the clock runs out, whoever has the most finished tubes wins; a tie is a draw.
 */
export class WaterSortEngine implements GameEngine<WaterSortState> {
  readonly game: GameType = 'WATER_SORT';
  readonly simultaneous = true;
  readonly matchTimeoutMs = WATER_SORT_TIME_MS;

  init(playerCount: number, ctx: EngineContext): { state: WaterSortState; turnSeat: number | null } {
    const tubes = generatePuzzle(ctx);
    return {
      state: {
        tubes,
        boards: Array.from({ length: playerCount }, () => tubes.map((t) => t.slice())),
        moves: Array(playerCount).fill(0),
        solvedBy: null,
      },
      turnSeat: null,
    };
  }

  applyMove(state: WaterSortState, seat: number, move: unknown, _ctx?: EngineContext): MoveResult<WaterSortState> {
    const { from, to } = (move ?? {}) as { from?: unknown; to?: unknown };
    const n = state.tubes.length;
    const ok = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n;
    if (!ok(from) || !ok(to)) throw new IllegalMove('BAD_MOVE', `Pick tubes from 0 to ${n - 1}`);
    if (from === to) throw new IllegalMove('BAD_MOVE', 'Pick two different tubes');
    const board = state.boards[seat];
    if (!board) throw new IllegalMove('BAD_MOVE', 'You are not in this game');

    const src = board[from], dst = board[to];
    if (src.length === 0) throw new IllegalMove('EMPTY_TUBE', 'That tube is empty');
    const colour = src[src.length - 1];
    if (dst.length >= TUBE_CAPACITY) throw new IllegalMove('TUBE_FULL', 'That tube is full');
    if (dst.length > 0 && dst[dst.length - 1] !== colour) throw new IllegalMove('COLOUR_MISMATCH', 'Colours do not match');

    const count = Math.min(topRun(src), TUBE_CAPACITY - dst.length);
    const next = board.map((t) => t.slice());
    next[from].splice(next[from].length - count, count);
    next[to].push(...Array(count).fill(colour));

    const boards = state.boards.map((b, i) => (i === seat ? next : b));
    const moves = state.moves.map((m, i) => (i === seat ? m + 1 : m));
    if (isSolved(next)) {
      return { state: { ...state, boards, moves, solvedBy: seat }, turnSeat: null, outcome: { type: 'WIN', winnerSeat: seat } };
    }
    return { state: { ...state, boards, moves }, turnSeat: null };
  }

  /** Time is up with nobody finished. */
  onDeadline(state: WaterSortState, activeSeats: number[]): { state: WaterSortState; outcome: Outcome } {
    if (state.boards.length === 1) return { state, outcome: { type: 'NONE' } }; // solo: out of time without solving it
    const scores = activeSeats.map((s) => ({ seat: s, done: progress(state.boards[s]) }));
    const best = Math.max(...scores.map((s) => s.done));
    const leaders = scores.filter((s) => s.done === best);
    return { state, outcome: leaders.length === 1 ? { type: 'WIN', winnerSeat: leaders[0].seat } : { type: 'DRAW' } };
  }

  /** Someone left but two or more still race on: nothing changes on the boards. */
  onSeatLeft(state: WaterSortState): MoveResult<WaterSortState> {
    return { state, turnSeat: null };
  }

  publicState(state: WaterSortState) {
    return {
      capacity: TUBE_CAPACITY,
      boards: state.boards,
      finished: state.boards.map((b) => progress(b)),
      moves: state.moves,
      solvedBy: state.solvedBy,
    };
  }
}
