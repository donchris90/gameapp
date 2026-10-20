import { drive, newDriver } from './bot';
import { CARS, DT, MAX_RACE_TICKS, Racer, World, makeWorld, newRacer, packInput, replay, step, unpackInput, levelSpec, poseOf } from './sim';

function race(world: World, skill: number, seed = 1, carId = 'starter') {
  const car = CARS[carId];
  const r = newRacer(world, car);
  const d = newDriver(seed, skill);
  const inputs: number[] = [];
  while (r.finishedAt === 0 && r.tick < MAX_RACE_TICKS) {
    const i = drive(world, car, r, d);
    inputs.push(packInput(i));
    step(world, car, r, i);
  }
  return { r, inputs };
}

describe('Apex Run rules', () => {
  it('builds the same road for the same seed and level, and a different one otherwise', () => {
    const a = makeWorld(42, 5), b = makeWorld(42, 5), c = makeWorld(43, 5);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.entities)).not.toBe(JSON.stringify(c.entities));
  });

  it('puts only cars on level 1, then adds bikes, pedestrians, trucks and buses as the level rises', () => {
    const kinds = (lvl: number) => new Set(makeWorld(7, lvl).entities.map((e) => e.kind));
    expect([...kinds(1)]).toEqual(['car']);
    expect(kinds(3).has('bike')).toBe(true);
    expect(kinds(2).has('ped') || kinds(4).has('ped') || kinds(8).has('ped')).toBe(true);
    expect(kinds(20).has('truck')).toBe(true);
    expect(kinds(30).has('bus')).toBe(true);
    const density = (lvl: number) => makeWorld(7, lvl).entities.length / makeWorld(7, lvl).length;
    expect(density(30)).toBeGreaterThan(density(1));
    expect(levelSpec(40).length).toBeGreaterThan(levelSpec(1).length);
  });

  it('never blocks the whole road: every row leaves a lane free', () => {
    for (const lvl of [1, 15, 40]) {
      const w = makeWorld(11, lvl);
      const vehicles = w.entities.filter((e) => e.kind !== 'ped');
      for (let i = 0; i < vehicles.length; i++) {
        const row = vehicles.filter((e) => Math.abs(e.z - vehicles[i].z) < 3.2 && e.amp === 0);
        expect(new Set(row.map((e) => e.lane)).size).toBeLessThanOrEqual(3);
      }
    }
  });

  it('is exactly repeatable: replaying the recorded inputs gives the same time', () => {
    const w = makeWorld(5, 6);
    const { r, inputs } = race(w, 0.8);
    expect(r.finishedAt).toBeGreaterThan(0);
    const again = replay(w, CARS.starter, inputs);
    expect(again.finished).toBe(true);
    expect(again.ticks).toBe(r.finishedAt);
    expect(again.hits).toBe(r.hits);
  });

  it('packs and unpacks inputs without loss', () => {
    for (const steer of [-1, -0.37, 0, 0.5, 1]) for (const brake of [false, true]) for (const nitro of [false, true]) {
      expect(unpackInput(packInput({ steer, brake, nitro }))).toEqual({ steer, brake, nitro });
    }
  });

  it('finishes in a sensible time and a crash slows the car without ending the race', () => {
    const w = makeWorld(3, 1);
    const car = CARS.starter;
    const r = newRacer(w, car);
    // drive straight, no steering: it will hit things, but must still finish
    let slowedBy = 0;
    while (r.finishedAt === 0 && r.tick < MAX_RACE_TICKS) {
      const before = r.v;
      step(w, car, r, { steer: 0, brake: false, nitro: false });
      if (r.hit) slowedBy = Math.max(slowedBy, before - r.v);
    }
    expect(r.finishedAt).toBeGreaterThan(0);
    expect(r.hits).toBeGreaterThan(0);
    expect(slowedBy).toBeGreaterThan(5);
    expect(r.finishedAt * DT).toBeLessThan(150);
  });

  it('a sharp driver beats a sloppy one, and better cars are faster', () => {
    let sharp = 0, sloppy = 0, fast = 0, slow = 0;
    for (let s = 1; s <= 6; s++) {
      const w = makeWorld(100 + s, 12);
      sharp += race(w, 0.95, s).r.finishedAt; sloppy += race(w, 0.05, s).r.finishedAt;
      fast += race(w, 0.9, s, 'flagship').r.finishedAt; slow += race(w, 0.9, s, 'starter').r.finishedAt;
    }
    expect(sharp).toBeLessThan(sloppy);
    expect(fast).toBeLessThan(slow);
  });

  it('good drivers get through high levels with few hits; pedestrians cross only when the racer arrives', () => {
    const w = makeWorld(9, 25);
    const { r } = race(w, 0.95, 4);
    expect(r.finishedAt).toBeGreaterThan(0);
    expect(r.hits).toBeLessThan(25);
    const ped = w.entities.find((e) => e.kind === 'ped')!;
    expect(poseOf(ped, 5, -1).moving).toBe(false);
    const later = poseOf(ped, 6, 5);
    expect(Math.abs(later.x - poseOf(ped, 5, -1).x)).toBeGreaterThan(1);
  });

  it('a racer who stops cannot be hit from behind by traffic it left behind', () => {
    const w = makeWorld(2, 4);
    const car = CARS.starter;
    const r: Racer = newRacer(w, car);
    for (let i = 0; i < 40 * 30 && r.finishedAt === 0; i++) step(w, car, r, { steer: 0, brake: true, nitro: false });
    expect(r.hits).toBe(0);
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';
describe('Apex Run rules in the app', () => {
  it('the app has exactly the same rules as the server (run: node scripts/sync-apex.mjs)', () => {
    const root = join(__dirname, '..', '..', '..', '..');
    for (const f of ['sim.ts', 'bot.ts']) {
      expect(readFileSync(join(root, 'mobile', 'src', 'apex', f), 'utf8')).toBe(readFileSync(join(__dirname, f), 'utf8'));
    }
  });
});
