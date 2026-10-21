import { drive, newDriver } from './apex/bot';
import { MAX_RACE_TICKS, carStats, makeWorld, newRacer, packInput, step } from './apex/sim';
import { APEX_RACE, ApexRaceEngine, ApexRaceState } from './apexrace.engine';
import { IllegalMove } from './engine';

const engine = new ApexRaceEngine();
const ctx = { randomInt: (n: number) => Math.floor(n / 3) };

/** Controls that finish the race: a computer driver at the wheel, recorded tick by tick. */
function record(s: ApexRaceState, skill = 0.7) {
  const world = makeWorld(s.seed, s.level, s.track, s.laps);
  const car = carStats(APEX_RACE.car);
  const r = newRacer(world, car);
  const d = newDriver(s.seed + 5, skill);
  const inputs: number[] = [];
  while (r.finishedAt === 0 && r.tick < MAX_RACE_TICKS) { const i = drive(world, car, r, d); inputs.push(packInput(i)); step(world, car, r, i); }
  return { inputs, ticks: r.finishedAt };
}

describe('Apex race engine', () => {
  const fresh = (n = 2) => engine.init(n, ctx).state;

  it('is a simultaneous race on the circuit with one seed for everyone', () => {
    const s = fresh(3);
    expect(engine.simultaneous).toBe(true);
    expect(s).toMatchObject({ track: 'circuit', ticks: [null, null, null] });
    expect(engine.publicState(s)).toMatchObject({ seed: s.seed, car: 'cts', finished: [false, false, false] });
  });

  it('keeps the time the server gets by driving the recording, and ends the race when everyone is in', () => {
    const s = fresh(2);
    const fast = record(s, 0.9), slow = record(s, 0.3);
    expect(fast.ticks).toBeGreaterThan(0);
    const one = engine.applyMove(s, 0, { inputs: slow.inputs }, ctx);
    expect(one.outcome).toBeUndefined();
    expect(one.state.ticks[0]).toBe(slow.ticks);
    const two = engine.applyMove(one.state, 1, { inputs: fast.inputs }, ctx);
    const winner = fast.ticks < slow.ticks ? 1 : fast.ticks > slow.ticks ? 0 : null;
    expect(two.outcome).toEqual(winner === null ? { type: 'DRAW' } : { type: 'WIN', winnerSeat: winner });
  });

  it('refuses recordings that do not finish, junk, and a second finish by the same seat', () => {
    const s = fresh(2);
    const rec = record(s);
    expect(() => engine.applyMove(s, 0, { inputs: rec.inputs.slice(0, 40) }, ctx)).toThrow(IllegalMove);
    expect(() => engine.applyMove(s, 0, { inputs: [] }, ctx)).toThrow(IllegalMove);
    expect(() => engine.applyMove(s, 0, { inputs: [1.5, 2] }, ctx)).toThrow(IllegalMove);
    expect(() => engine.applyMove(s, 0, { inputs: [99999] }, ctx)).toThrow(IllegalMove);
    expect(() => engine.applyMove(s, 0, {}, ctx)).toThrow(IllegalMove);
    expect(() => engine.applyMove(s, 5, { inputs: rec.inputs }, ctx)).toThrow(IllegalMove);
    const done = engine.applyMove(s, 0, { inputs: rec.inputs }, ctx).state;
    expect(() => engine.applyMove(done, 0, { inputs: rec.inputs }, ctx)).toThrow(IllegalMove);
  });

  it('cannot be won with a time the phone claims: a recording from a different seed is just another run', () => {
    const s = fresh(2);
    const other = { ...s, seed: s.seed + 1 };
    const rec = record(other);
    // Played on the wrong road it either fails to finish or earns whatever time that road gives; never the claimed one.
    try { const r = engine.applyMove(s, 0, { inputs: rec.inputs }, ctx); expect(r.state.ticks[0]).toBeGreaterThan(0); } catch (e) { expect(e).toBeInstanceOf(IllegalMove); }
  });

  it('on timeout the best verified time wins, and nobody wins with no times', () => {
    const s = fresh(3);
    const a = engine.applyMove(s, 2, { inputs: record(s).inputs }, ctx).state;
    expect(engine.onDeadline(a, [0, 1, 2]).outcome).toEqual({ type: 'WIN', winnerSeat: 2 });
    expect(engine.onDeadline(s, [0, 1, 2]).outcome).toEqual({ type: 'NONE' });
  });

  it('ends the race when the last driver still racing leaves after the others have finished', () => {
    const s = fresh(3);
    const rec = record(s);
    const a = engine.applyMove(engine.applyMove(s, 0, { inputs: rec.inputs }, ctx).state, 1, { inputs: record(s, 0.5).inputs }, ctx);
    expect(a.outcome).toBeUndefined();
    expect(engine.onSeatLeft(a.state, 2, [0, 1]).outcome).toBeDefined();
    expect(engine.onSeatLeft(s, 2, [0, 1]).outcome).toBeUndefined();
    const quit = engine.onSeatLeft(engine.applyMove(s, 0, { inputs: rec.inputs }, ctx).state, 2, [0, 1]);
    expect(engine.applyMove(quit.state, 1, { inputs: rec.inputs }, ctx).outcome).toBeDefined();
  });
});
