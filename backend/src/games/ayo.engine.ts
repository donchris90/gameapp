import { GameType } from '../generated/prisma/client';
import { EngineContext, GameEngine, IllegalMove, MoveResult, Outcome } from './engine';

/**
 * Ayo, house rules (the same game as the original app):
 *  - 12 pits, 48 seeds. Round 1: each player owns 6 pits of 4 seeds. Sow counter-clockwise (increasing pit number).
 *  - Relay: if your last seed lands in a pit that already had seeds, pick them all up and keep sowing.
 *    The turn ends when the last seed lands in an EMPTY pit.
 *  - Packing: a pit that reaches exactly 4 is packed. Mid-sow it goes to the pit's owner. If your LAST seed makes a
 *    pit 4 (either side) you pack it and your turn ends.
 *  - A player with no seeds on their pits skips their turn.
 *  - When 4 or fewer seeds are left, they go to whoever packed the 4 before them, and the round ends.
 *  - Next round: each player gets one pit of 4 for every 4 seeds they packed. Rounds alternate who starts.
 *  - A player who starts a round with one pit or none has lost. With exactly two pits they choose: quit (lose) or continue.
 */
export const PITS = 12;
export const MAX_SOW_STEPS = 2000;
export const MAX_ROUND_TURNS = 400;
export const MAX_ROUNDS = 30;

/** How long each step takes to show on a phone. The client uses the same numbers, so the next player's clock only starts once the move has been shown. */
export const AYO_ANIM = { dropMs: 380, pickMs: 700, packMs: 900, finalMs: 1000, roundMs: 1800, maxMoveMs: 14000 };
export function ayoAnimMs(events: Array<{ t: string }>): number {
  const drops = events.filter((e) => e.t === 'drop').length;
  const dropMs = drops > 0 ? Math.min(AYO_ANIM.dropMs, Math.floor(AYO_ANIM.maxMoveMs / drops)) : AYO_ANIM.dropMs;
  let ms = 0;
  for (const e of events) ms += e.t === 'drop' ? dropMs : e.t === 'pick' ? AYO_ANIM.pickMs : e.t === 'pack' ? AYO_ANIM.packMs : e.t === 'final' ? AYO_ANIM.finalMs : e.t === 'round' ? AYO_ANIM.roundMs : 0;
  return ms + 300;
}

export type AyoEvent =
  | { t: 'pick'; pit: number; count: number }
  | { t: 'drop'; pit: number }
  | { t: 'pack'; pit: number; seat: number }
  | { t: 'final'; seat: number; seeds: number }
  | { t: 'round'; round: number };

export interface AyoState {
  /** The 12 pits. */
  pits: number[];
  /** Who owns each pit this round. */
  owners: number[];
  /** Seeds packed this round, per seat. */
  captured: [number, number];
  /** Seat whose move it is (or who starts once a pending choice is made). */
  turn: number;
  /** Total moves made in the game. */
  moves: number;
  round: number;
  roundTurns: number;
  lastPacker: number | null;
  roundStarter: number;
  /** A player with exactly two pits must choose to quit or continue. */
  decision: { seat: number } | null;
  /** The last move, with everything a client needs to replay it seed by seed. */
  last: { seat: number; pit: number; packed: number; before: number[]; ownersBefore: number[]; capturedBefore: [number, number]; events: AyoEvent[] } | null;
  lastRound: { round: number; pits: [number, number] } | null;
}

export const ownersFor = (seat0Pits: number): number[] => Array.from({ length: PITS }, (_, i) => (i < seat0Pits ? 0 : 1));
export const legalMoves = (pits: number[], seat: number, owners: number[] = ownersFor(6)): number[] =>
  pits.map((n, i) => (owners[i] === seat && n > 0 ? i : -1)).filter((i) => i >= 0);
const total = (b: number[]) => b.reduce((a, c) => a + c, 0);

/** One move's sowing, pure. Seeds are always conserved. */
export function simulateSow(input: number[], pit: number, seat: number, owners: number[]) {
  const board = input.slice();
  let hand = board[pit];
  board[pit] = 0;
  let cur = pit, steps = 0;
  const packedBy: [number, number] = [0, 0];
  let lastReceiver: number | null = null;
  const events: AyoEvent[] = [{ t: 'pick', pit, count: hand }];
  while (hand > 0) {
    cur = (cur + 1) % PITS; board[cur] += 1; hand -= 1; steps += 1;
    events.push({ t: 'drop', pit: cur });
    if (board[cur] === 4) {
      const to = hand === 0 ? seat : owners[cur]; // last seed: the sower packs it, even on the other side
      board[cur] = 0; packedBy[to] += 4; lastReceiver = to;
      events.push({ t: 'pack', pit: cur, seat: to });
      continue;
    }
    if (hand === 0 && board[cur] > 1) { hand = board[cur]; board[cur] = 0; events.push({ t: 'pick', pit: cur, count: hand }); }
    if (steps >= MAX_SOW_STEPS && hand > 0) { board[cur] += hand; hand = 0; }
  }
  return { board, packedBy, lastReceiver, events };
}

export class AyoEngine implements GameEngine<AyoState> {
  readonly game: GameType = 'AYO';

  init(playerCount: number, ctx: EngineContext): { state: AyoState; turnSeat: number | null } {
    if (playerCount !== 2) throw new Error('Ayo is a two player game');
    const first = ctx.randomInt(2);
    return {
      state: { pits: Array(PITS).fill(4), owners: ownersFor(6), captured: [0, 0], turn: first, moves: 0, round: 1, roundTurns: 0, lastPacker: null, roundStarter: first, decision: null, last: null, lastRound: null },
      turnSeat: first,
    };
  }

  applyMove(state: AyoState, seat: number, move: unknown, _ctx?: EngineContext): MoveResult<AyoState> {
    const m = (move ?? {}) as { pit?: unknown; decision?: unknown };
    if (state.decision) {
      if (seat !== state.decision.seat) throw new IllegalMove('NOT_YOUR_TURN', 'Waiting for the other player to choose');
      if (m.decision !== 'quit' && m.decision !== 'continue') throw new IllegalMove('BAD_MOVE', 'Choose quit or continue');
      if (m.decision === 'quit') return { state: { ...state, decision: null }, turnSeat: null, outcome: { type: 'WIN', winnerSeat: 1 - seat } };
      const next = { ...state, decision: null };
      return { state: next, turnSeat: next.turn };
    }
    if (seat !== state.turn) throw new IllegalMove('NOT_YOUR_TURN', 'It is not your turn');
    const pit = m.pit;
    if (typeof pit !== 'number' || !Number.isInteger(pit) || pit < 0 || pit >= PITS) throw new IllegalMove('BAD_MOVE', 'Pick one of your bowls');
    if (state.owners[pit] !== seat) throw new IllegalMove('NOT_YOUR_PIT', 'That bowl is not yours');
    if (state.pits[pit] === 0) throw new IllegalMove('EMPTY_PIT', 'That bowl is empty');

    const st: AyoState = { ...state, pits: state.pits.slice(), owners: state.owners.slice(), captured: [state.captured[0], state.captured[1]] };
    const before = state.pits.slice(), ownersBefore = state.owners.slice(), capturedBefore: [number, number] = [state.captured[0], state.captured[1]];
    const r = simulateSow(st.pits, pit, seat, st.owners);
    st.pits = r.board;
    st.captured[0] += r.packedBy[0]; st.captured[1] += r.packedBy[1];
    if (r.lastReceiver !== null) st.lastPacker = r.lastReceiver;
    st.roundTurns += 1; st.moves += 1;
    const events = r.events;

    let outcome: Outcome | undefined;
    const left = total(st.pits);
    if (left === 0 || left <= 4 || st.roundTurns >= MAX_ROUND_TURNS) outcome = this.endRound(st, events);
    else {
      const next = 1 - seat;
      if (legalMoves(st.pits, next, st.owners).length > 0) st.turn = next;
      else if (legalMoves(st.pits, seat, st.owners).length > 0) st.turn = seat;
      else outcome = this.endRound(st, events);
    }
    st.last = { seat, pit, packed: r.packedBy[seat], before, ownersBefore, capturedBefore, events };
    if (outcome) return { state: st, turnSeat: null, outcome };
    return { state: st, turnSeat: st.decision ? st.decision.seat : st.turn, holdMs: ayoAnimMs(events) };
  }

  /** Gives the leftover seeds away, then starts the next round or ends the game. Mutates `st`. */
  private endRound(st: AyoState, events: AyoEvent[]): Outcome | undefined {
    const left = total(st.pits);
    if (left > 0) {
      const to = st.lastPacker ?? (st.turn === 0 ? 1 : 0);
      events.push({ t: 'final', seat: to, seeds: left });
      st.captured[to] += left;
      st.pits = Array(PITS).fill(0);
    }
    const pits: [number, number] = [Math.floor(st.captured[0] / 4), Math.floor(st.captured[1] / 4)];
    st.lastRound = { round: st.round, pits };
    if (pits[0] <= 1 || pits[1] <= 1) return { type: 'WIN', winnerSeat: pits[0] <= 1 ? 1 : 0 }; // one pit or none: lost
    if (st.round >= MAX_ROUNDS) return pits[0] === pits[1] ? { type: 'DRAW' } : { type: 'WIN', winnerSeat: pits[0] > pits[1] ? 0 : 1 };
    st.round += 1; st.roundTurns = 0;
    st.owners = ownersFor(pits[0]);
    st.pits = Array(PITS).fill(4);
    st.captured = [0, 0];
    st.lastPacker = null;
    st.roundStarter = 1 - st.roundStarter;
    st.turn = st.roundStarter;
    const two = pits[0] === 2 ? 0 : pits[1] === 2 ? 1 : null;
    st.decision = two === null ? null : { seat: two };
    events.push({ t: 'round', round: st.round });
    return undefined;
  }

  publicState(state: AyoState) {
    return {
      pits: state.pits, owners: state.owners, captured: state.captured, turn: state.turn, moves: state.moves,
      round: state.round, decision: state.decision, last: state.last, lastRound: state.lastRound,
    };
  }
}
