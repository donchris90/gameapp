import { GameType } from '../generated/prisma/client';
import { EngineContext, GameEngine } from '../games/engine';
import { legalMoves, simulateSow } from '../games/ayo.engine';
import { legalTokens } from '../games/ludo.engine';
import { HOLD_ON, MARKET, PICK_TWO, playable } from '../games/whot.engine';
import { WIN_LINES } from '../games/tictactoe.engine';

/** How often a computer player ignores its own best idea and plays any legal move, so people can win. */
const SLIP = { TICTACTOE: 0.2, AYO: 0.2, LUDO: 0.15, WHOT: 0.15 } as const;

const pickOne = <T,>(a: T[], ctx: EngineContext) => a[ctx.randomInt(a.length)];

/**
 * Chooses the computer's move from the raw match state. It only ever uses legal moves, checked by running the
 * real game engine, so a computer opponent can never do something a person could not.
 * Returns null when the game gives it nothing to do (not its turn, or a game it does not play).
 */
export function chooseMove(game: GameType, engine: GameEngine<any>, state: any, seat: number, ctx: EngineContext): Record<string, unknown> | null {
  const slip = ctx.randomInt(1000) / 1000 < (SLIP as Record<string, number>)[game];
  if (game === 'TICTACTOE') {
    if (state.turn !== seat) return null;
    const free = (state.board as Array<number | null>).map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    if (free.length === 0) return null;
    if (slip) return { cell: pickOne(free, ctx) };
    const finishing = (who: number) => free.find((c) => WIN_LINES.some((l) => l.includes(c) && l.every((i) => i === c || state.board[i] === who)));
    const win = finishing(seat);
    if (win !== undefined) return { cell: win };
    const block = finishing(1 - seat);
    if (block !== undefined) return { cell: block };
    for (const group of [[4], [0, 2, 6, 8], [1, 3, 5, 7]]) {
      const open = group.filter((c) => free.includes(c));
      if (open.length) return { cell: pickOne(open, ctx) };
    }
    return { cell: pickOne(free, ctx) };
  }

  if (game === 'AYO') {
    if (state.decision) return state.decision.seat === seat ? { decision: 'continue' } : null;
    if (state.turn !== seat) return null;
    const options = legalMoves(state.pits, seat, state.owners);
    if (options.length === 0) return null;
    if (slip) return { pit: pickOne(options, ctx) };
    // Look one move ahead with the real rules: what I pack minus what my sowing packs for the opponent.
    let best: number[] = [];
    let bestScore = -Infinity;
    for (const pit of options) {
      const r = simulateSow(state.pits, pit, seat, state.owners);
      const score = r.packedBy[seat] - r.packedBy[1 - seat];
      if (score > bestScore) { bestScore = score; best = [pit]; } else if (score === bestScore) best.push(pit);
    }
    return { pit: pickOne(best, ctx) };
  }

  if (game === 'LUDO') {
    if (state.turn !== seat) return null;
    if (state.phase === 'ROLL') return { action: 'roll' };
    const options = legalTokens(state, seat, state.dice);
    if (options.length === 0) return null;
    if (slip) return { action: 'move', token: pickOne(options, ctx) };
    let best: number[] = [];
    let bestScore = -Infinity;
    for (const token of options) {
      const r = engine.applyMove(state, seat, { action: 'move', token }, ctx);
      const from = state.tokens[seat][token] as number;
      const to = r.state.tokens[seat][token] as number;
      const captured = r.state.last?.captured.length ?? 0;
      const score = captured * 100 + (to === 56 ? 60 : 0) + (from === -1 ? 40 : 0) + to * 0.5 + (r.outcome ? 1000 : 0);
      if (score > bestScore) { bestScore = score; best = [token]; } else if (score === bestScore) best.push(token);
    }
    return { action: 'move', token: pickOne(best, ctx) };
  }
  if (game === 'WHOT') {
    if (state.turn !== seat) return null;
    const options = playable(state, seat);
    if (options.length === 0) return { action: 'draw' };
    // Facing a pick-up with a 2 in hand the computer usually answers it, but sometimes takes the cards.
    if (state.pending > 0 && slip) return { action: 'draw' };
    if (slip) return { action: 'play', card: pickOne(options, ctx) };
    const hand = state.hands[seat] as Array<{ s: number; n: number }>;
    const others = (state.hands as unknown[][]).map((h, i) => ({ i, n: h.length })).filter((x) => x.i !== seat && !state.left.includes(x.i));
    const closest = Math.min(...others.map((x) => x.n));
    let best: number[] = [];
    let bestScore = -Infinity;
    for (const idx of options) {
      const c = hand[idx];
      const sameShape = hand.filter((h, k) => k !== idx && h.s === c.s).length;
      let score = sameShape * 0.6 + (hand.length === 1 ? 1000 : 0);
      if (c.n === MARKET) score += closest <= 2 ? 6 : 2.5;
      else if (c.n === PICK_TWO) score += closest <= 3 ? 5 : 3;
      else if (c.n === HOLD_ON) score += 2;
      else score += c.n / 20; // spend the high plain cards first
      if (score > bestScore) { bestScore = score; best = [idx]; } else if (score === bestScore) best.push(idx);
    }
    return { action: 'play', card: pickOne(best, ctx) };
  }
  return null;
}
