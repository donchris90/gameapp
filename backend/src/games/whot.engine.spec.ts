import { chooseMove } from '../bots/bot-policy';
import { Card, DECK_SIZE, HAND_SIZE, WhotEngine, WhotState, canPlay, makeDeck, playable } from './whot.engine';
import { IllegalMove } from './engine';

const engine = new WhotEngine();
let seed = 7;
const ctx = { randomInt: (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; } };
const c = (s: number, n: number): Card => ({ s, n });
const total = (st: WhotState) => st.draw.length + st.discard.length + st.hands.reduce((a, h) => a + h.length, 0);

/** A table set up by hand: hands, the card showing, and whose turn it is. */
function table(hands: Card[][], top: Card, turn = 0, extra: Partial<WhotState> = {}): WhotState {
  return { players: hands.length, hands, draw: [c(4, 1), c(4, 2), c(4, 3), c(4, 4), c(4, 5), c(4, 7)], discard: [top], turn, pending: 0, left: [], moves: 0, stalls: 0, last: null, ...extra };
}
const play = (st: WhotState, seat: number, card: number) => engine.applyMove(st, seat, { action: 'play', card }, ctx);
const draw = (st: WhotState, seat: number) => engine.applyMove(st, seat, { action: 'draw' }, ctx);

describe('Whot deck and deal', () => {
  it('has 49 cards: no Whot cards, 12/12/9/9/7 by shape', () => {
    const d = makeDeck();
    expect(d).toHaveLength(DECK_SIZE);
    expect([0, 1, 2, 3, 4].map((s) => d.filter((x) => x.s === s).length)).toEqual([12, 12, 9, 9, 7]);
    expect(d.some((x) => x.n === 20)).toBe(false);
    expect(new Set(d.map((x) => `${x.s}:${x.n}`)).size).toBe(49);
  });

  it.each([2, 3, 4])('deals 6 each to %i players and starts on a plain card, keeping all 49 cards', (n) => {
    for (let k = 0; k < 20; k++) {
      const { state, turnSeat } = engine.init(n, ctx);
      expect(state.hands.every((h) => h.length === HAND_SIZE)).toBe(true);
      expect(total(state)).toBe(49);
      expect([1, 2, 14]).not.toContain(state.discard[0].n);
      expect(turnSeat).toBe(state.turn);
    }
    expect(() => engine.init(1, ctx)).toThrow();
    expect(() => engine.init(5, ctx)).toThrow();
  });

  it('never shows anyone else\'s hand', () => {
    const { state } = engine.init(3, ctx);
    const pub = engine.publicState(state) as any;
    expect(pub.hand).toBeUndefined();
    expect(JSON.stringify(pub)).not.toContain('"hands"');
    expect(pub.counts).toEqual([6, 6, 6]);
    const mine = engine.publicStateFor(state, 1) as any;
    expect(mine.hand).toEqual(state.hands[1]);
  });
});

describe('Whot play', () => {
  it('matches by shape or number only', () => {
    expect(canPlay(c(0, 5), c(0, 8), 0)).toBe(true);
    expect(canPlay(c(1, 8), c(0, 8), 0)).toBe(true);
    expect(canPlay(c(1, 5), c(0, 8), 0)).toBe(false);
  });

  it('passes the turn after a plain card and rejects a wrong card or the wrong player', () => {
    const st = table([[c(0, 5), c(1, 7)], [c(2, 3), c(2, 5)]], c(0, 8));
    const r = play(st, 0, 0);
    expect(r.state.turn).toBe(1);
    expect(r.state.discard[r.state.discard.length - 1]).toEqual(c(0, 5));
    expect(() => play(st, 0, 1)).toThrow(IllegalMove);
    expect(() => play(st, 1, 0)).toThrow(IllegalMove);
    expect(() => play(st, 0, 9)).toThrow(IllegalMove);
  });

  it('drawing is allowed any time on your turn, even with a playable card: it takes one card and passes', () => {
    const st = table([[c(0, 5), c(1, 7)], [c(2, 3), c(2, 5)]], c(0, 8));
    const early = draw(st, 0);
    expect(early.state.hands[0]).toHaveLength(3);
    expect(early.state.turn).toBe(1);
    expect(() => draw(st, 1)).toThrow(IllegalMove); // still not your turn
    const stuck = table([[c(1, 7), c(2, 10)], [c(2, 3), c(2, 5)]], c(0, 8));
    const r = draw(stuck, 0);
    expect(r.state.hands[0]).toHaveLength(3);
    expect(r.state.turn).toBe(1);
    expect(total(r.state)).toBe(total(stuck));
  });

  it('1 Hold On: the same player plays again', () => {
    const st = table([[c(0, 1), c(0, 5)], [c(2, 3)]], c(0, 8));
    const r = play(st, 0, 0);
    expect(r.turnSeat).toBe(0);
    expect(r.state.turn).toBe(0);
  });

  it('14 General Market: everyone else picks one and the player goes again', () => {
    const st = table([[c(0, 14), c(0, 5)], [c(2, 3)], [c(3, 3)]], c(0, 8));
    const r = play(st, 0, 0);
    expect(r.state.hands.map((h) => h.length)).toEqual([1, 2, 2]);
    expect(r.state.turn).toBe(0);
    expect(r.state.last).toMatchObject({ kind: 'market', count: 1 });
    expect(total(r.state)).toBe(total(st));
  });

  it('5 and 8 are plain cards with no power', () => {
    for (const n of [5, 8]) {
      const st = table([[c(0, n), c(0, 3)], [c(2, 3)]], c(0, 7));
      const r = play(st, 0, 0);
      expect(r.state.turn).toBe(1);
      expect(r.state.pending).toBe(0);
    }
  });
});

describe('Whot Pick Two', () => {
  it('makes the next player pick two and lose their turn when they cannot answer', () => {
    const st = table([[c(0, 2), c(0, 5)], [c(2, 3), c(1, 7)], [c(3, 3)]], c(0, 8));
    const a = play(st, 0, 0);
    expect(a.state.pending).toBe(2);
    expect(a.state.turn).toBe(1);
    expect(engine.publicStateFor(a.state, 1)).toMatchObject({ canPlay: [], canDraw: true });
    const b = draw(a.state, 1);
    expect(b.state.hands[1]).toHaveLength(4);
    expect(b.state.pending).toBe(0);
    expect(b.state.turn).toBe(2);
    expect(b.state.last).toMatchObject({ kind: 'pick', count: 2 });
  });

  it('stacks: a 2 answers a 2 on any shape, and the penalty grows', () => {
    const st = table([[c(0, 2), c(0, 5)], [c(3, 2), c(1, 7)], [c(2, 2), c(3, 3)], [c(4, 3)]], c(0, 8));
    const a = play(st, 0, 0);
    expect(() => play(a.state, 1, 1)).toThrow(IllegalMove); // only a 2 answers
    const b = play(a.state, 1, 0);
    expect(b.state.pending).toBe(4);
    const c3 = play(b.state, 2, 0);
    expect(c3.state.pending).toBe(6);
    const d = draw(c3.state, 3);
    expect(d.state.hands[3]).toHaveLength(7);
    expect(d.state.turn).toBe(0);
  });

  it('a player facing a pick-up may take the cards even though they hold a 2', () => {
    const st = table([[c(0, 2), c(0, 5)], [c(3, 2), c(1, 7)]], c(0, 8));
    const a = play(st, 0, 0);
    expect(draw(a.state, 1).state.hands[1]).toHaveLength(4);
  });
});

describe('Whot winning and running out', () => {
  it('the first to empty their hand wins, even on a power card', () => {
    for (const n of [5, 1, 2, 14]) {
      const st = table([[c(0, n)], [c(2, 3), c(2, 5)]], c(0, 7));
      expect(play(st, 0, 0).outcome).toEqual({ type: 'WIN', winnerSeat: 0 });
    }
  });

  it('turns the discards over when the pile runs out, keeping the card in play', () => {
    const st = table([[c(1, 7)], [c(2, 3)]], c(0, 8), 0, { draw: [], discard: [c(4, 1), c(4, 2), c(4, 3), c(0, 8)] });
    const r = draw(st, 0);
    expect(r.state.hands[0]).toHaveLength(2);
    expect(r.state.discard).toEqual([c(0, 8)]);
    expect(total(r.state)).toBe(total(st));
  });

  it('ends on fewest cards when nobody can play or draw', () => {
    let st = table([[c(1, 7), c(1, 10)], [c(2, 3)]], c(0, 8), 0, { draw: [], discard: [c(0, 8)] });
    let r = draw(st, 0);
    expect(r.outcome).toBeUndefined();
    r = draw(r.state, 1);
    expect(r.outcome).toEqual({ type: 'WIN', winnerSeat: 1 });
  });

  it('a player who leaves hands their cards back and the game goes on', () => {
    const st = table([[c(0, 5)], [c(2, 3), c(2, 5)], [c(0, 3), c(3, 3)]], c(0, 8), 1);
    const r = engine.onSeatLeft(st, 1, [0, 2]);
    expect(r.state.hands[1]).toEqual([]);
    expect(r.state.turn).toBe(2);
    expect(r.state.draw.length).toBe(st.draw.length + 2);
    expect(play(r.state, 2, 0).state.turn).toBe(0); // skips the seat that left
  });
});

describe('Whot computer player', () => {
  it('only ever makes moves the rules allow, through whole games', () => {
    for (let g = 0; g < 30; g++) {
      const players = 2 + (g % 3);
      let { state } = engine.init(players, ctx);
      let outcome: unknown;
      for (let i = 0; i < 1500 && !outcome; i++) {
        const mv = chooseMove('WHOT' as any, engine, state, state.turn, ctx);
        expect(mv).not.toBeNull();
        const r = engine.applyMove(state, state.turn, mv, ctx);
        expect(total(r.state)).toBe(49);
        state = r.state;
        outcome = r.outcome;
      }
      expect(outcome).toBeDefined();
    }
  });

  it('plays the card that wins and answers a pick-up when it can', () => {
    const st = table([[c(0, 5)], [c(2, 3), c(2, 5)]], c(0, 7));
    expect(chooseMove('WHOT' as any, engine, st, 0, { randomInt: (n: number) => (n === 1000 ? 999 : 0) })).toEqual({ action: 'play', card: 0 });
    expect(chooseMove('WHOT' as any, engine, st, 1, ctx)).toBeNull(); // not its turn
    expect(playable(st, 1)).toEqual([]);
  });
});
