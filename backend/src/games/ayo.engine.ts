import { GameType } from '../generated/prisma/client';
import { EngineContext, GameEngine, IllegalMove, MoveResult, Outcome } from './engine';

/** No capture for this many moves in a row ends the game: each side keeps the seeds on its own row. */
export const STALL_LIMIT = 120;
export const WIN_SCORE = 25;

export interface AyoState {
  /** 12 pits. Seat 0 owns pits 0-5, seat 1 owns pits 6-11. Seeds are sown in increasing pit order, wrapping round. */
  pits: number[];
  captured: [number, number];
  turn: number;
  moves: number;
  sinceCapture: number;
  /** The last move, so clients can animate it. */
  last: { seat: number; pit: number; endPit: number; captured: number; pits: number[] } | null;
}

const ownerOf = (pit: number) => (pit < 6 ? 0 : 1);
const rowOf = (seat: number) => (seat === 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11]);
const seedsOn = (pits: number[], seat: number) => rowOf(seat).reduce((n, p) => n + pits[p], 0);

/** Pit where the last seed lands. The starting pit is skipped on laps of 12 or more. */
function endPitOf(from: number, seeds: number): number {
  let pos = from, left = seeds;
  while (left > 0) { pos = (pos + 1) % 12; if (pos === from) continue; left--; }
  return pos;
}

/** Pits this seat may play. If the opponent has no seeds, only moves that give them some are legal. */
export function legalMoves(pits: number[], seat: number): number[] {
  const own = rowOf(seat).filter((p) => pits[p] > 0);
  if (seedsOn(pits, 1 - seat) > 0) return own;
  return own.filter((p) => {
    // does any sown seed land on the opponent's row?
    let pos = p, left = pits[p];
    while (left > 0) { pos = (pos + 1) % 12; if (pos === p) continue; if (ownerOf(pos) !== seat) return true; left--; }
    return false;
  });
}

/**
 * Ayo (Oware, abapa rules). Pick a pit on your row and sow its seeds one by one round the board.
 * If the last seed makes a pit on the opponent's row hold 2 or 3, you capture it, and the pits before it
 * in the same row as long as they also hold 2 or 3. A move that would capture every seed on the
 * opponent's row captures nothing. You must give the opponent seeds if they have none. First to 25 wins.
 */
export class AyoEngine implements GameEngine<AyoState> {
  readonly game: GameType = 'AYO';

  init(playerCount: number, ctx: EngineContext): { state: AyoState; turnSeat: number | null } {
    if (playerCount !== 2) throw new Error('Ayo is a two player game');
    const first = ctx.randomInt(2);
    return { state: { pits: Array(12).fill(4), captured: [0, 0], turn: first, moves: 0, sinceCapture: 0, last: null }, turnSeat: first };
  }

  applyMove(state: AyoState, seat: number, move: unknown, _ctx?: EngineContext): MoveResult<AyoState> {
    const pit = (move as { pit?: unknown } | null)?.pit;
    if (typeof pit !== 'number' || !Number.isInteger(pit) || pit < 0 || pit > 11) throw new IllegalMove('BAD_MOVE', 'Pick a pit from 0 to 11');
    if (seat !== state.turn) throw new IllegalMove('NOT_YOUR_TURN', 'It is not your turn');
    if (ownerOf(pit) !== seat) throw new IllegalMove('NOT_YOUR_PIT', 'That pit is on your opponent\'s row');
    if (state.pits[pit] === 0) throw new IllegalMove('EMPTY_PIT', 'That pit is empty');
    if (!legalMoves(state.pits, seat).includes(pit)) throw new IllegalMove('MUST_FEED', 'Your opponent has no seeds: you must play a pit that gives them some');

    const pits = state.pits.slice();
    const seeds = pits[pit];
    pits[pit] = 0;
    const end = endPitOf(pit, seeds);
    let pos = pit, left = seeds;
    while (left > 0) { pos = (pos + 1) % 12; if (pos === pit) continue; pits[pos]++; left--; }

    // Capture: walk back from the last pit while it is the opponent's and holds 2 or 3.
    let gain = 0;
    const opp = 1 - seat;
    const taken: number[] = [];
    for (let p = end; ownerOf(p) === opp && (pits[p] === 2 || pits[p] === 3); p = (p + 11) % 12) taken.push(p);
    const takenSeeds = taken.reduce((n, p) => n + pits[p], 0);
    if (taken.length > 0 && takenSeeds < seedsOn(pits, opp)) { // taking everything is not allowed
      for (const p of taken) { gain += pits[p]; pits[p] = 0; }
    }

    const captured: [number, number] = [state.captured[0], state.captured[1]];
    captured[seat] += gain;
    const next: AyoState = {
      pits, captured, turn: opp, moves: state.moves + 1,
      sinceCapture: gain > 0 ? 0 : state.sinceCapture + 1,
      last: { seat, pit, endPit: end, captured: gain, pits: pits.slice() },
    };

    if (captured[seat] >= WIN_SCORE) return this.finish(next, { type: 'WIN', winnerSeat: seat });

    // The opponent cannot move (nothing they can play, e.g. empty and unfeedable) or the game is going nowhere:
    // each player keeps the seeds on their own row.
    if (legalMoves(pits, opp).length === 0 || next.sinceCapture >= STALL_LIMIT) {
      const done = { ...next, captured: [captured[0] + seedsOn(pits, 0), captured[1] + seedsOn(pits, 1)] as [number, number], pits: Array(12).fill(0) };
      return this.finish(done, this.verdict(done.captured));
    }
    return { state: next, turnSeat: opp };
  }

  private verdict(c: [number, number]): Outcome {
    if (c[0] === c[1]) return { type: 'DRAW' };
    return { type: 'WIN', winnerSeat: c[0] > c[1] ? 0 : 1 };
  }

  private finish(state: AyoState, outcome: Outcome): MoveResult<AyoState> {
    return { state, turnSeat: null, outcome };
  }

  publicState(state: AyoState) {
    return {
      pits: state.pits, captured: state.captured, turn: state.turn, moves: state.moves,
      rows: { 0: [0, 1, 2, 3, 4, 5], 1: [6, 7, 8, 9, 10, 11] }, last: state.last,
    };
  }
}
