import { GameType } from '../generated/prisma/client';
import { EngineContext, GameEngine } from '../games/engine';
import { legalMoves } from '../games/ayo.engine';
import { legalTokens } from '../games/ludo.engine';
import { WIN_LINES } from '../games/tictactoe.engine';

/** How often a computer player ignores its own best idea and plays any legal move, so people can win. */
const SLIP = { TICTACTOE: 0.2, AYO: 0.2, LUDO: 0.15 } as const;

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
    if (state.turn !== seat) return null;
    const options = legalMoves(state.pits, seat);
    if (options.length === 0) return null;
    if (slip) return { pit: pickOne(options, ctx) };
    // Look one move ahead with the real rules and prefer the biggest capture.
    let best: number[] = [];
    let bestScore = -Infinity;
    for (const pit of options) {
      const r = engine.applyMove(state, seat, { pit }, ctx);
      const score = r.state.captured[seat] - r.state.captured[1 - seat];
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
  return null;
}
