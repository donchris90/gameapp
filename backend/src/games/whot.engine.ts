import { GameType } from '../generated/prisma/client';
import { EngineContext, GameEngine, IllegalMove, MoveResult, Outcome } from './engine';

/** Shapes: 0 circle, 1 triangle, 2 cross, 3 square, 4 star. */
export const SHAPES = 5;
export interface Card { s: number; n: number }

/** The 49-card deck (the five Whot cards are not used). */
const NUMBERS: number[][] = [
  [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14], // circle
  [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14], // triangle
  [1, 2, 3, 5, 7, 10, 11, 13, 14], // cross
  [1, 2, 3, 5, 7, 10, 11, 13, 14], // square
  [1, 2, 3, 4, 5, 7, 8], // star
];
export const makeDeck = (): Card[] => NUMBERS.flatMap((ns, s) => ns.map((n) => ({ s, n })));
export const DECK_SIZE = 49;
export const HAND_SIZE = 6;

/** The only cards with a power. */
export const HOLD_ON = 1, PICK_TWO = 2, MARKET = 14;
export const isSpecial = (c: Card) => c.n === HOLD_ON || c.n === PICK_TWO || c.n === MARKET;

export type WhotEvent =
  | { seat: number; kind: 'play'; card: Card }
  | { seat: number; kind: 'draw'; count: number }
  | { seat: number; kind: 'pick'; count: number } // took the stacked pick-up
  | { seat: number; kind: 'market'; card: Card; count: number } // played 14: everyone else drew `count`
  | { seat: number; kind: 'pass' };

export interface WhotState {
  players: number;
  hands: Card[][];
  draw: Card[];
  /** The last card is the one in play. */
  discard: Card[];
  turn: number;
  /** Cards the next player must pick up unless they answer with a 2. */
  pending: number;
  left: number[];
  moves: number;
  /** Turns in a row that ended with nothing to play and nothing left to draw. */
  stalls: number;
  last: WhotEvent | null;
}

/** A card can be played on the one showing if it has the same shape or number. Facing a pick-up, only a 2 answers it. */
export const canPlay = (card: Card, top: Card, pending: number) => (pending > 0 ? card.n === PICK_TWO : card.s === top.s || card.n === top.n);

export function playable(state: WhotState, seat: number): number[] {
  const top = state.discard[state.discard.length - 1];
  const out: number[] = [];
  state.hands[seat].forEach((c, i) => { if (canPlay(c, top, state.pending)) out.push(i); });
  return out;
}

function shuffle<T>(a: T[], ctx: EngineContext): T[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = ctx.randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Gives a hand up to `count` cards from the pile, turning the discards over when the pile runs out. */
function deal(state: WhotState, seat: number, count: number, ctx: EngineContext): WhotState {
  let { draw, discard } = state;
  const hand = state.hands[seat].slice();
  for (let i = 0; i < count; i++) {
    if (draw.length === 0 && discard.length > 1) {
      draw = shuffle(discard.slice(0, -1), ctx);
      discard = [discard[discard.length - 1]];
    }
    if (draw.length === 0) break;
    hand.push(draw[0]); draw = draw.slice(1);
  }
  return { ...state, draw, discard, hands: state.hands.map((h, i) => (i === seat ? hand : h)) };
}
const drawn = (before: WhotState, after: WhotState, seat: number) => after.hands[seat].length - before.hands[seat].length;

/**
 * Whot for 2-4 players with the Nigerian rules we agreed: 49 cards (no Whot cards), 6 each, match the shape or the number,
 * go to market (draw one) whenever you like. Only three cards have a power: 1 Hold On (play again), 2 Pick Two (the next player picks 2
 * and misses their turn, unless they answer with a 2, and then it stacks) and 14 General Market (everyone else picks 1, and
 * you play again). The first to empty their hand wins, even on a power card; "last card" is called automatically.
 */
export class WhotEngine implements GameEngine<WhotState> {
  readonly game: GameType = 'WHOT';

  init(playerCount: number, ctx: EngineContext): { state: WhotState; turnSeat: number | null } {
    if (playerCount < 2 || playerCount > 4) throw new Error('Whot is for 2 to 4 players');
    let pile = shuffle(makeDeck(), ctx);
    const hands: Card[][] = [];
    for (let p = 0; p < playerCount; p++) { hands.push(pile.slice(0, HAND_SIZE)); pile = pile.slice(HAND_SIZE); }
    // The card that starts the game is a plain one, so nobody begins facing a power card.
    const at = pile.findIndex((c) => !isSpecial(c));
    const start = pile[at];
    pile = [...pile.slice(0, at), ...pile.slice(at + 1)];
    const first = ctx.randomInt(playerCount);
    return {
      state: { players: playerCount, hands, draw: pile, discard: [start], turn: first, pending: 0, left: [], moves: 0, stalls: 0, last: null },
      turnSeat: first,
    };
  }

  private nextSeat(state: Pick<WhotState, 'players' | 'left'>, from: number): number {
    for (let i = 1; i <= state.players; i++) {
      const s = (from + i) % state.players;
      if (!state.left.includes(s)) return s;
    }
    return from;
  }

  applyMove(state: WhotState, seat: number, move: unknown, ctx: EngineContext): MoveResult<WhotState> {
    const m = (move ?? {}) as { action?: unknown; card?: unknown };
    if (m.action !== 'play' && m.action !== 'draw') throw new IllegalMove('BAD_MOVE', 'Send { action: "play", card } or { action: "draw" }');
    if (seat !== state.turn) throw new IllegalMove('NOT_YOUR_TURN', 'It is not your turn');
    return m.action === 'play' ? this.play(state, seat, m.card, ctx) : this.takeCards(state, seat, ctx);
  }

  private play(state: WhotState, seat: number, index: unknown, ctx: EngineContext): MoveResult<WhotState> {
    const hand = state.hands[seat];
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= hand.length) throw new IllegalMove('BAD_MOVE', 'Pick one of your cards');
    if (!playable(state, seat).includes(index)) {
      throw new IllegalMove('ILLEGAL_CARD', state.pending > 0 ? 'Answer with a 2 or pick up the cards' : 'That card does not match the shape or number');
    }
    const card = hand[index];
    let next: WhotState = {
      ...state, hands: state.hands.map((h, i) => (i === seat ? h.filter((_, k) => k !== index) : h)),
      discard: [...state.discard, card], moves: state.moves + 1, stalls: 0, last: { seat, kind: 'play', card },
    };
    if (next.hands[seat].length === 0) return { state: next, turnSeat: null, outcome: { type: 'WIN', winnerSeat: seat } };

    if (card.n === PICK_TWO) {
      const turn = this.nextSeat(next, seat);
      return { state: { ...next, pending: next.pending + 2, turn }, turnSeat: turn };
    }
    if (card.n === MARKET) {
      let count = 0;
      for (let s = 0; s < next.players; s++) {
        if (s === seat || next.left.includes(s)) continue;
        const before = next;
        next = deal(next, s, 1, ctx);
        count = Math.max(count, drawn(before, next, s));
      }
      return { state: { ...next, last: { seat, kind: 'market', card, count } }, turnSeat: seat }; // and you play again
    }
    if (card.n === HOLD_ON) return { state: next, turnSeat: seat };
    const turn = this.nextSeat(next, seat);
    return { state: { ...next, turn }, turnSeat: turn };
  }

  /** Pick up the stacked cards, or one card from the pile (go to market). Allowed at any time on your turn, even with a card you could play. The turn passes. */
  private takeCards(state: WhotState, seat: number, ctx: EngineContext): MoveResult<WhotState> {
    const facing = state.pending > 0;
    const want = facing ? state.pending : 1;
    const after = deal(state, seat, want, ctx);
    const got = drawn(state, after, seat);
    const stalled = got === 0 ? state.stalls + 1 : 0;
    const turn = this.nextSeat(state, seat);
    const next: WhotState = {
      ...after, pending: 0, turn, moves: state.moves + 1, stalls: stalled,
      last: got === 0 ? { seat, kind: 'pass' } : facing ? { seat, kind: 'pick', count: got } : { seat, kind: 'draw', count: got },
    };
    // Everyone is stuck with nothing to play and nothing to draw: the shortest hand wins.
    const active = next.players - next.left.length;
    if (stalled >= active) return { state: next, turnSeat: null, outcome: this.byCards(next) };
    return { state: next, turnSeat: turn };
  }

  private byCards(state: WhotState): Outcome {
    const seats = Array.from({ length: state.players }, (_, i) => i).filter((s) => !state.left.includes(s));
    const fewest = Math.min(...seats.map((s) => state.hands[s].length));
    const best = seats.filter((s) => state.hands[s].length === fewest);
    return best.length === 1 ? { type: 'WIN', winnerSeat: best[0] } : { type: 'DRAW' };
  }

  /** A player left with two or more still playing: their cards go back under the pile and the game goes on. */
  onSeatLeft(state: WhotState, seat: number, _active?: number[]): MoveResult<WhotState> {
    const left = [...state.left, seat];
    let next: WhotState = { ...state, left, draw: [...state.draw, ...state.hands[seat]], hands: state.hands.map((h, i) => (i === seat ? [] : h)) };
    if (state.turn === seat) next = { ...next, turn: this.nextSeat(next, seat), pending: 0 };
    return { state: next, turnSeat: next.turn };
  }

  /** What anyone may see: the card in play, how many cards each hand holds, and what just happened. Hands stay hidden. */
  publicState(state: WhotState) {
    return {
      players: state.players, top: state.discard[state.discard.length - 1], turn: state.turn, pending: state.pending,
      counts: state.hands.map((h) => h.length), drawCount: state.draw.length, discardCount: state.discard.length,
      left: state.left, moves: state.moves, last: state.last,
    };
  }

  /** The same, plus your own hand and which of your cards can be played now. */
  publicStateFor(state: WhotState, seat: number) {
    const mine = state.hands[seat] ?? [];
    return {
      ...this.publicState(state), seat, hand: mine,
      canPlay: state.turn === seat ? playable(state, seat) : [],
      canDraw: state.turn === seat,
    };
  }
}
