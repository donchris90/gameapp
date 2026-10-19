import { GameType } from '../generated/prisma/client';

/**
 * How a match ends. `NONE` is for solo games where the player did not finish: nobody wins and nobody is paid.
 */
export type Outcome = { type: 'WIN'; winnerSeat: number } | { type: 'DRAW' } | { type: 'NONE' };

export interface MoveResult<S> {
  state: S;
  /** Whose turn is next. null when nobody is on the clock. */
  turnSeat: number | null;
  outcome?: Outcome;
}

export interface EngineContext {
  /** Cryptographically random integer in [0, n). Engines must use this, never Math.random. */
  randomInt(n: number): number;
}

/** A move the rules do not allow. The message is safe to show to the player. */
export class IllegalMove extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

/**
 * One game's rules. Engines are pure: they get state in and return state out,
 * with no database, wallet or clock access. The match service does the rest
 * (stakes, payouts, timers, saving, pushing events).
 */
export interface GameEngine<S = unknown> {
  readonly game: GameType;
  /** Override the default time allowed per move. */
  readonly turnTimeoutMs?: number;
  /** Everyone plays at once (Water Sort race): no turns, no version check, one clock for the whole match. */
  readonly simultaneous?: boolean;
  /** Total time for a simultaneous match. */
  readonly matchTimeoutMs?: number;
  init(playerCount: number, ctx: EngineContext): { state: S; turnSeat: number | null };
  /** Throws IllegalMove for a bad move. Must not mutate `state`. */
  applyMove(state: S, seat: number, move: unknown, ctx: EngineContext): MoveResult<S>;
  /**
   * Called when a player resigns, times out or leaves while 2 or more others are still
   * in the game (Ludo, Water Sort race). Return the state with that seat removed from play.
   * Not needed for two player games: the opponent simply wins.
   */
  onSeatLeft?(state: S, seat: number, activeSeats: number[]): MoveResult<S>;
  /** Simultaneous games only: the clock ran out with no winner. Decide by progress. */
  onDeadline?(state: S, activeSeats: number[]): { state: S; outcome: Outcome };
  /** What clients are allowed to see. Hide anything secret here. */
  publicState(state: S): unknown;
}
