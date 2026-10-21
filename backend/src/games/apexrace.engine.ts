import { GameType } from '../generated/prisma/client';
import { EngineContext, GameEngine, IllegalMove, MoveResult, Outcome } from './engine';
import { MAX_RACE_TICKS, TICKS_PER_SECOND, carStats, makeWorld, replay } from './apex/sim';

/** One shared clock for the whole race: the longest race the rules allow, plus time to start and upload. */
export const APEX_RACE_TIME_MS = (MAX_RACE_TICKS / TICKS_PER_SECOND + 150) * 1000;
/** Everyone drives the same stock car on the same road, so the fastest driver wins, not the biggest garage. */
export const APEX_RACE = { track: 'circuit', laps: 2, level: 1, car: 'cts' } as const;

export interface ApexRaceState {
  seed: number;
  track: string;
  laps: number;
  level: number;
  /** Verified finish time in ticks for each seat, or null while still racing. */
  ticks: Array<number | null>;
  /** Seats of drivers who quit. The race ends when everyone else has a time. */
  left?: number[];
}

/**
 * Apex Run race room. Every player drives the same seeded road at the same time on their own phone and sees the
 * others as live ghosts. When a player finishes, the app sends their recorded controls; the server drives the
 * same road with those controls and keeps the time it gets, never one the phone claims. Fastest time wins.
 */
export class ApexRaceEngine implements GameEngine<ApexRaceState> {
  readonly game: GameType = 'APEX';
  readonly simultaneous = true;
  readonly matchTimeoutMs = APEX_RACE_TIME_MS;

  init(playerCount: number, ctx: EngineContext): { state: ApexRaceState; turnSeat: number | null } {
    return {
      state: { seed: ctx.randomInt(2_000_000_000), track: APEX_RACE.track, laps: APEX_RACE.laps, level: APEX_RACE.level, ticks: Array(playerCount).fill(null) },
      turnSeat: null,
    };
  }

  applyMove(state: ApexRaceState, seat: number, move: unknown, _ctx?: EngineContext): MoveResult<ApexRaceState> {
    if (seat < 0 || seat >= state.ticks.length) throw new IllegalMove('BAD_MOVE', 'You are not in this race');
    if (state.ticks[seat] !== null) throw new IllegalMove('ALREADY_FINISHED', 'You already finished this race');
    const inputs = (move as { inputs?: unknown } | null)?.inputs;
    if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > MAX_RACE_TICKS) throw new IllegalMove('BAD_MOVE', 'No race recording was sent');
    for (const v of inputs) if (!Number.isInteger(v) || v < 0 || v > 2047) throw new IllegalMove('BAD_MOVE', 'The race recording is not valid');

    const world = makeWorld(state.seed, state.level, state.track, state.laps);
    const res = replay(world, carStats(APEX_RACE.car), inputs as number[]);
    if (!res.finished || res.ticks <= 0) throw new IllegalMove('NOT_FINISHED', 'That recording does not finish the race');

    const ticks = state.ticks.map((t, i) => (i === seat ? res.ticks : t));
    const next = { ...state, ticks };
    // Everyone is in: decide now. Players who left never finish, so they are counted by the match, not here.
    const active = ticks.map((_, i) => i).filter((i) => !(next.left ?? []).includes(i));
    if (active.every((i) => ticks[i] !== null)) return { state: next, turnSeat: null, outcome: this.decide(next, active) };
    return { state: next, turnSeat: null };
  }

  /** Lowest verified time wins; equal best times are a draw. Seats with no time cannot win. */
  private decide(state: ApexRaceState, seats: number[]): Outcome {
    const timed = seats.filter((s) => state.ticks[s] !== null).map((s) => ({ seat: s, t: state.ticks[s] as number }));
    if (timed.length === 0) return { type: 'NONE' };
    const best = Math.min(...timed.map((x) => x.t));
    const leaders = timed.filter((x) => x.t === best);
    return leaders.length === 1 ? { type: 'WIN', winnerSeat: leaders[0].seat } : { type: 'DRAW' };
  }

  /** The clock ran out: whoever has a verified time takes it. */
  onDeadline(state: ApexRaceState, activeSeats: number[]): { state: ApexRaceState; outcome: Outcome } {
    return { state, outcome: this.decide(state, activeSeats) };
  }

  /** Someone left but two or more still race. If every driver still in has finished, the race is over. */
  onSeatLeft(state: ApexRaceState, seat: number, activeSeats: number[]): MoveResult<ApexRaceState> {
    const next = { ...state, left: [...new Set([...(state.left ?? []), seat])] };
    if (activeSeats.every((s) => next.ticks[s] !== null)) return { state: next, turnSeat: null, outcome: this.decide(next, activeSeats) };
    return { state: next, turnSeat: null };
  }

  publicState(state: ApexRaceState) {
    return { seed: state.seed, track: state.track, laps: state.laps, level: state.level, car: APEX_RACE.car, ticks: state.ticks, finished: state.ticks.map((t) => t !== null), left: state.left ?? [] };
  }
}
