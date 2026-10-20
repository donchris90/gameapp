/**
 * Apex Run: the rules of the race, shared by the phone and the server.
 *
 * This file is copied into the mobile app (see scripts/sync-apex.mjs), and the same code must give the same answer on both.
 * That is what lets the server replay a player's steering and confirm their time. So the rules only use + - * / and
 * comparisons, Math.min/max/abs/floor/sqrt and integer maths: no sin/cos/random, which can differ between engines.
 */

import { CIRCUIT } from './circuit';

export const TICKS_PER_SECOND = 30;
export const DT = 1 / TICKS_PER_SECOND;
export const LANES = 4;
export const LANE_W = 3.2;
export const ROAD_HALF = (LANES * LANE_W) / 2; // 6.4
export const CAR_HALF_W = 0.9;
export const CAR_HALF_L = 2.3;
export const MIN_SPEED = 7;
export const PED_SPEED = 1.9;
export const MAX_LEVEL = 60;

export type Kind = 'car' | 'bike' | 'truck' | 'bus' | 'ped';
export const laneX = (lane: number) => (lane - (LANES - 1) / 2) * LANE_W;

// ---- random numbers: the same seed always gives the same road ----
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- cars you can drive ----
export interface CarStats { id: string; vmax: number; accel: number; handling: number; nitroSeconds: number }
export const CARS: Record<string, CarStats> = {
  starter: { id: 'starter', vmax: 50, accel: 15, handling: 9.0, nitroSeconds: 2.0 },
  sport: { id: 'sport', vmax: 54, accel: 17, handling: 9.6, nitroSeconds: 2.4 },
  luxury: { id: 'luxury', vmax: 58, accel: 19, handling: 10.2, nitroSeconds: 2.8 },
  flagship: { id: 'flagship', vmax: 62, accel: 21, handling: 10.8, nitroSeconds: 3.2 },
  // the garage cars (see mobile/src/apex/cars.ts for names and prices): base stats, before upgrades
  cts: { id: 'cts', vmax: 50, accel: 15, handling: 9.0, nitroSeconds: 2.0 },
  gt3: { id: 'gt3', vmax: 54, accel: 17, handling: 9.6, nitroSeconds: 2.4 },
  one1: { id: 'one1', vmax: 58, accel: 19, handling: 10.2, nitroSeconds: 2.8 },
  chiron: { id: 'chiron', vmax: 60, accel: 20, handling: 10.4, nitroSeconds: 3.0 },
  mansory: { id: 'mansory', vmax: 62, accel: 21, handling: 10.8, nitroSeconds: 3.2 },
  senna: { id: 'senna', vmax: 64, accel: 22, handling: 11.2, nitroSeconds: 3.4 },
};

// ---- upgrades: four kinds, five levels each, bought with coins in the garage ----
export const UPGRADE_KINDS = ['engine', 'turbo', 'tyres', 'nitro'] as const;
export const MAX_UPGRADE = 5;
/** What one level of each upgrade adds. */
export const UPGRADE_STEP = { engine: 1.0, turbo: 0.9, tyres: 0.35, nitro: 0.25 } as const;
/** The car's stats with its upgrade levels (engine, turbo, tyres, nitro). The same arithmetic runs on the phone and on the server. */
export function carStats(id: string, levels: number[] = []): CarStats {
  const b = CARS[id] ?? CARS.cts;
  const lv = (i: number) => Math.max(0, Math.min(MAX_UPGRADE, Math.floor(levels[i] ?? 0)));
  return {
    id: b.id, vmax: b.vmax + lv(0) * UPGRADE_STEP.engine, accel: b.accel + lv(1) * UPGRADE_STEP.turbo,
    handling: b.handling + lv(2) * UPGRADE_STEP.tyres, nitroSeconds: b.nitroSeconds + lv(3) * UPGRADE_STEP.nitro,
  };
}


// ---- the road: what traffic there is depends on the level ----
export interface Entity {
  id: number; kind: Kind;
  z: number; lane: number; // lane centre (m) for vehicles; for pedestrians the side they start from is `dir`
  speed: number; // m/s along the road (0 for pedestrians)
  w: number; l: number;
  amp: number; freq: number; phase: number; // bikes drift sideways: x = lane + amp * tri(t * freq + phase)
  dir: number; trigger: number; // pedestrians: crossing direction (+1 left to right) and how close the player must be before they step out
}
export interface World { seed: number; level: number; length: number; entities: Entity[]; peds: number[]; track: string; curves: Curve[]; lapLength: number; laps: number; driftK: number; pads: Pad[] }

const SIZE: Record<Kind, [number, number]> = { car: [1.9, 4.5], bike: [0.8, 2.0], truck: [2.5, 9.0], bus: [2.6, 11.0], ped: [0.7, 0.7] };
export const sizeOf = (k: Kind) => SIZE[k];

export function levelSpec(level: number) {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return {
    level: L,
    length: Math.min(4200, 2800 + L * 25), // metres to the finish line
    gapMin: Math.max(22, 50 - L * 0.6), gapMax: Math.max(38, 88 - L * 0.9), // fewer, more spread-out rows of traffic
    trafficSpeed: 1 + Math.min(0.35, L * 0.012),
    bikes: L >= 3 ? Math.min(0.3, 0.08 + L * 0.006) : 0,
    trucks: L >= 6 ? Math.min(0.22, 0.05 + L * 0.004) : 0,
    buses: L >= 10 ? Math.min(0.16, 0.04 + L * 0.003) : 0,
    peds: L >= 2 ? Math.min(0.3, 0.05 + L * 0.006) : 0,
    drift: Math.min(2.2, 0.9 + L * 0.03),
  };
}


// ---- tracks: the road bends. Everything in the rules stays in "road space" (x across, z along the road); a bend only pushes
// cars towards the outside edge, and the phone draws the road curved. Radius R in metres: + turns right, - turns left, 0 is straight.
export interface Pad { z: number; x: number } // a nitro pad: z along one lap, x across the road
export interface Curve { from: number; to: number; k: number } // k = 1 / radius at the middle of the bend (+ right)
export interface TrackInfo { loop?: boolean; id: string; name: string; blurb: string; level: number; theme: number; ground: number; pattern: Array<[number, number]>; feel: string }
export const TRACKS: TrackInfo[] = [
  { id: 'coast', name: 'Coastal Sweep', blurb: 'Long, flowing bends along the sea. A good place to learn.', level: 1, theme: 0, ground: 0x7a9a58, feel: 'Easy', pattern: [[260, 0], [240, 420], [200, 0], [260, -380], [180, 0], [220, 450], [240, -400]] },
  { id: 'dunes', name: 'Desert Esses', blurb: 'Back-to-back S-bends through the dunes. Stay smooth.', level: 3, theme: 1, ground: 0xb59a62, feel: 'Medium', pattern: [[160, 0], [140, 300], [140, -300], [140, 300], [140, -300], [200, 0], [180, -250], [180, 250]] },
  { id: 'city', name: 'Downtown Night', blurb: 'Tight city corners under the lights. Brake early.', level: 6, theme: 2, ground: 0x1b2438, feel: 'Hard', pattern: [[200, 0], [180, 260], [140, -260], [160, 0], [200, -240], [120, 300], [180, 0]] },
  { id: 'pass', name: 'Mountain Pass', blurb: 'Hairpins and switchbacks at sunset. Only for brave drivers.', level: 10, theme: 1, ground: 0x6b5a3c, feel: 'Expert', pattern: [[220, 0], [150, 170], [100, 0], [170, -160], [90, 0], [120, 150], [160, -190], [140, 0]] },
];
export const CIRCUIT_TRACK: TrackInfo = { id: 'circuit', loop: true, name: 'Apex Circuit', blurb: 'A floodlit closed circuit with nitro pads. Race 2, 3 or 5 laps against five drivers.', level: 1, theme: 1, ground: 0x2e5a45, feel: 'Circuit', pattern: [] };
export const LAP_CHOICES = [2, 3, 5];
export const trackInfo = (id: string): TrackInfo | undefined => (id === 'circuit' ? CIRCUIT_TRACK : TRACKS.find((x) => x.id === id));

export function curvesFor(track: string, length: number): Curve[] {
  const info = trackInfo(track);
  if (!info) return [];
  const out: Curve[] = [];
  let z = 150, open = true; // a straight start
  while (open) {
    open = false;
    for (const [len, radius] of info.pattern) {
      if (z + len > length - 150) { open = false; break; } // and a straight finish
      if (radius !== 0) out.push({ from: z, to: z + len, k: 1 / radius });
      z += len; open = true;
    }
  }
  return out;
}

/** How sharply the road bends at distance z (1/radius, + is right). Eased in and out so there are no jolts. */
export function curvatureAt(world: { curves: Curve[]; lapLength?: number }, z: number): number {
  if (world.lapLength) { // a closed circuit: the same lap again and again, read from the table
    const L = world.lapLength, zl = z - Math.floor(z / L) * L, f = zl / CIRCUIT.step, i = Math.floor(f), u = f - i, n = CIRCUIT.k.length;
    return CIRCUIT.k[i % n] * (1 - u) + CIRCUIT.k[(i + 1) % n] * u;
  }
  const cs = world.curves;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (z < c.from) return 0;
    if (z > c.to) continue;
    const len = c.to - c.from, ramp = len * 0.3, a = Math.min(1, (z - c.from) / ramp), b = Math.min(1, (c.to - z) / ramp);
    return c.k * (a * a * (3 - 2 * a)) * (b * b * (3 - 2 * b));
  }
  return 0;
}

export const DRIFT_K = 0.4;
/** Sideways speed (m/s) a bend pushes a car at speed v towards the outside (+ is right). */
export const driftAt = (world: { curves: Curve[]; lapLength?: number; driftK?: number }, z: number, v: number) => -(world.driftK ?? DRIFT_K) * curvatureAt(world, z) * v * v;

export function makeWorld(seed: number, level: number, track = 'straight', laps = 3): World {
  const s = levelSpec(level);
  if (track === 'circuit') { // no traffic: a grid of racers and nitro pads, lap after lap
    const L = CIRCUIT.length, n = Math.max(1, Math.min(9, Math.floor(laps)));
    const pads: Pad[] = [[0.11, -3.5], [0.3, 3], [0.5, 0], [0.7, -3], [0.88, 3.5]].map(([f, x]) => ({ z: f * L, x }));
    return { seed, level: s.level, length: n * L, track, curves: [], entities: [], peds: [], lapLength: L, laps: n, driftK: 0.3, pads };
  }
  const r = rng((seed ^ Math.imul(s.level, 0x9e3779b1)) >>> 0);
  const entities: Entity[] = [];
  let z = 95;
  let id = 0;
  while (z < s.length - 60) {
    z += s.gapMin + r() * (s.gapMax - s.gapMin);
    // A row: at most LANES - 1 lanes are taken, so there is always a way through.
    const lanes = [0, 1, 2, 3].sort(() => 0); // keep order, shuffled below with our own random numbers
    for (let i = lanes.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = lanes[i]; lanes[i] = lanes[j]; lanes[j] = t; }
    const count = r() < 0.7 ? 1 : r() < 0.85 ? 2 : 3;
    for (let k = 0; k < count; k++) {
      const pick = r();
      const kind: Kind = pick < s.buses ? 'bus' : pick < s.buses + s.trucks ? 'truck' : pick < s.buses + s.trucks + s.bikes ? 'bike' : 'car';
      const [w, l] = SIZE[kind];
      const base = kind === 'bus' ? 14 : kind === 'truck' ? 15 : kind === 'bike' ? 24 : 19;
      const speed = (base + r() * (kind === 'bike' ? 14 : 12)) * s.trafficSpeed;
      const lane = laneX(lanes[k]);
      const drifts = kind === 'bike';
      entities.push({
        id: id++, kind, z: z + k * 3.1 * r(), lane, speed, w, l,
        amp: drifts ? s.drift * (0.5 + r() * 0.5) : 0, freq: 0.18 + r() * 0.25, phase: r() * 2,
        dir: 0, trigger: 0,
      });
    }
    if (r() < s.peds) {
      const dir = r() < 0.5 ? 1 : -1;
      entities.push({ id: id++, kind: 'ped', z: z + 14 + r() * 18, lane: 0, speed: 0, w: SIZE.ped[0], l: SIZE.ped[1], amp: 0, freq: 0, phase: 0, dir, trigger: 125 + r() * 35 }); // steps out about 2.5 to 3.2 s before a fast car arrives, so it is in the road when you get there
    }
  }
  entities.sort((a, b) => a.z - b.z);
  entities.forEach((e, i) => { e.id = i; });
  // nitro pickups: one every 220 to 360 m, in any lane, so a driver who has run dry can find more
  const pads: Pad[] = []; const pr = rng((seed ^ 0x6e17a9d1) >>> 0);
  for (let pz = 220 + pr() * 80; pz < s.length - 140; pz += 220 + pr() * 140) pads.push({ z: pz, x: laneX(Math.floor(pr() * LANES)) });
  return { seed, level: s.level, length: s.length, track, curves: curvesFor(track, s.length), lapLength: 0, laps: 1, driftK: DRIFT_K, pads, entities, peds: entities.filter((e) => e.kind === 'ped').map((e) => e.id) };
}

/** A triangle wave between -1 and 1 (no sine, so every device agrees). */
export const tri = (u: number) => Math.abs(((u % 2) + 2) % 2 - 1) * 2 - 1;

export interface Pose { x: number; z: number; moving: boolean }
/** Where something is at time `t` seconds. A pedestrian's crossing starts when this player came close (`arrivedAt`, in seconds, or -1). */
export function poseOf(e: Entity, t: number, arrivedAt: number): Pose {
  if (e.kind === 'ped') {
    const side = ROAD_HALF + 1.6;
    if (arrivedAt < 0) return { x: -e.dir * side, z: e.z, moving: false };
    const walked = PED_SPEED * Math.max(0, t - arrivedAt);
    const x = -e.dir * side + e.dir * walked;
    const end = e.dir * side;
    return { x: e.dir > 0 ? Math.min(x, end) : Math.max(x, end), z: e.z, moving: walked < 2 * side };
  }
  return { x: e.lane + (e.amp ? e.amp * tri(t * e.freq + e.phase) : 0), z: e.z + e.speed * t, moving: true };
}

// ---- one car in the race ----
export interface Input { steer: number; brake: boolean; nitro: boolean } // steer: -1 (left) .. 1 (right), in steps of 0.01
export interface Racer {
  z: number; x: number; v: number; tick: number;
  nitro: number; invul: number; finishedAt: number; // finishedAt: tick the line was crossed, 0 while racing
  hits: number; pedHits: number; lostMs: number;
  arrived: number[]; // per pedestrian id: seconds when this racer got close (-1 none)
  hit: Kind | null; // set on the tick something was hit, for sound and shaking
  nitroOn: boolean;
  boost: number; // ticks of pad boost left
  padLap: number[]; // per pad: the lap on which it was last used (-1 none)
}

export function newRacer(world: World, car: CarStats): Racer {
  return { z: 0, x: laneX(1), v: 0, tick: 0, nitro: car.nitroSeconds, invul: 0, finishedAt: 0, hits: 0, pedHits: 0, lostMs: 0, arrived: world.peds.map(() => -1), hit: null, nitroOn: false, boost: 0, padLap: world.pads.map(() => -1) };
}

export const clampSteer = (s: number) => Math.max(-1, Math.min(1, Math.round(s * 100) / 100));

/** Advances one racer by one tick (1/30 s). */
export function step(world: World, car: CarStats, r: Racer, input: Input): void {
  r.hit = null;
  if (r.finishedAt > 0) { r.tick++; r.v = Math.max(0, r.v - 20 * DT); r.z += r.v * DT; return; }
  const t = r.tick * DT;
  const steer = clampSteer(input.steer);

  // speed
  const wantsNitro = input.nitro && r.nitro > 0 && !input.brake;
  r.nitroOn = wantsNitro;
  if (wantsNitro) r.nitro = Math.max(0, r.nitro - DT);
  else if (r.nitro < car.nitroSeconds) r.nitro = Math.min(car.nitroSeconds, r.nitro + 0.12 * DT);
  const cap = car.vmax * (wantsNitro ? 1.3 : 1) * (r.boost > 0 ? 1.12 : 1);
  if (input.brake) r.v = Math.max(MIN_SPEED, r.v - 28 * DT);
  else if (r.v < cap) r.v = Math.min(cap, r.v + car.accel * (wantsNitro ? 1.8 : 1) * (1 - (r.v / cap) * 0.55) * DT);
  else r.v = Math.max(cap, r.v - 14 * DT);
  if (r.v < MIN_SPEED && r.tick > 0) r.v = MIN_SPEED;

  // steering: a little stiffer at speed so it stays readable
  const grip = 0.65 + 0.35 * Math.min(1, r.v / 30);
  r.x += (steer * car.handling * grip + driftAt(world, r.z, r.v)) * DT;
  const edge = ROAD_HALF - CAR_HALF_W;
  const pinned = (r.x <= -edge && driftAt(world, r.z, r.v) < 0) || (r.x >= edge && driftAt(world, r.z, r.v) > 0);
  r.x = Math.max(-edge, Math.min(edge, r.x));
  if (pinned && r.v > MIN_SPEED) r.v = Math.max(MIN_SPEED, r.v - 9 * DT); // scraping the barrier in a bend
  r.z += r.v * DT;
  r.tick++;
  if (r.boost > 0) r.boost--;
  for (let i = 0; i < world.pads.length; i++) { // nitro pads, once a lap
    const p = world.pads[i], L = world.lapLength || world.length + 1, lap = Math.floor(r.z / L), zl = r.z - lap * L;
    if (r.padLap[i] !== lap && Math.abs(zl - p.z) < 5 && Math.abs(r.x - p.x) < 3.4) { r.padLap[i] = lap; r.nitro = Math.min(car.nitroSeconds, r.nitro + car.nitroSeconds * 0.4); r.boost = 36; }
  }
  if (r.invul > 0) r.invul--;

  // pedestrians step out when this racer gets close
  for (let i = 0; i < world.peds.length; i++) {
    if (r.arrived[i] < 0) { const e = world.entities[world.peds[i]]; if (r.z >= e.z - e.trigger) r.arrived[i] = t; }
  }

  // things in the way
  if (r.invul === 0) {
    const tt = r.tick * DT;
    const lo = lowerBound(world.entities, r.z - 14 - 30 * tt * 0); // entities start ahead and mostly stay ahead: scan a window
    for (let i = Math.max(0, lo - 40); i < world.entities.length; i++) {
      const e = world.entities[i];
      if (e.z > r.z + 90 + tt * 40) break; // beyond anything that could reach us
      const pi = e.kind === 'ped' ? world.peds.indexOf(e.id) : -1;
      const p = poseOf(e, tt, pi >= 0 ? r.arrived[pi] : -1);
      if (p.z < r.z - 0.3 && e.kind !== 'ped') continue; // already behind our middle: it cannot hit us
      const dz = Math.abs(p.z - r.z), dx = Math.abs(p.x - r.x);
      if (dz < e.l / 2 + CAR_HALF_L * 0.8 && dx < e.w / 2 + CAR_HALF_W * 0.85) {
        const ped = e.kind === 'ped';
        const heavy = e.kind === 'truck' || e.kind === 'bus';
        r.v = Math.max(MIN_SPEED, r.v * (ped ? 0.28 : heavy ? 0.4 : 0.5));
        // a solid thing: you cannot drive through it. Hitting its back, you drop behind it and fall to its speed; hitting its side, you are pushed clear.
        if (p.z >= r.z - 0.3) {
          const stop = p.z - (e.l / 2 + CAR_HALF_L * (ped ? 0.3 : 0.8));
          if (r.z > stop) r.z = stop;
          if (!ped) r.v = Math.max(MIN_SPEED, Math.min(r.v, e.speed * 0.9));
        }
        r.invul = ped ? 30 : 20;
        const clear = e.w / 2 + CAR_HALF_W * 0.9;
        const dir = r.x >= p.x ? 1 : -1;
        r.x = dir > 0 ? Math.max(r.x + 0.7, p.x + clear * 0.8) : Math.min(r.x - 0.7, p.x - clear * 0.8);
        r.x = Math.max(-edge, Math.min(edge, r.x));
        r.hits++; if (ped) r.pedHits++;
        r.hit = e.kind;
        break;
      }
    }
  }
  if (r.z >= world.length && r.finishedAt === 0) r.finishedAt = r.tick;
}

function lowerBound(es: Entity[], z: number): number {
  let lo = 0, hi = es.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (es[m].z < z) lo = m + 1; else hi = m; }
  return lo;
}

// ---- replaying a recorded run (this is what the server does to check a time) ----
/** One input per tick, packed in a number: steer (0..200) | brake << 8 | nitro << 9. */
export const packInput = (i: Input) => (Math.round(clampSteer(i.steer) * 100) + 100) | (i.brake ? 256 : 0) | (i.nitro ? 512 : 0);
export const unpackInput = (n: number): Input => ({ steer: ((n & 255) - 100) / 100, brake: (n & 256) !== 0, nitro: (n & 512) !== 0 });

/**
 * Cars are solid: two racers never share the same space. Run this after every racer has taken its step.
 * The car behind drops to the speed of the car in front (and counts a hit if it was going faster); both are pushed apart sideways.
 * It uses only simple arithmetic, so the phone and the server agree exactly.
 */
export function collideRacers(racers: Racer[]): void {
  const long = CAR_HALF_L * 2 + 0.2, wide = CAR_HALF_W * 2 + 0.15, edge = ROAD_HALF - CAR_HALF_W;
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < racers.length; i++) for (let j = i + 1; j < racers.length; j++) {
    const a = racers[i], b = racers[j];
    const dz = a.z - b.z, dx = a.x - b.x;
    if (Math.abs(dz) >= long || Math.abs(dx) >= wide) continue;
    const front = dz >= 0 ? a : b, rear = dz >= 0 ? b : a;
    if (rear.finishedAt === 0 && rear.invul === 0 && rear.v > front.v) { rear.v = Math.max(MIN_SPEED, Math.min(rear.v * 0.6, front.v * 0.95)); rear.invul = 20; rear.hits++; rear.hit = 'car'; }
    if (rear.z > front.z - long) rear.z = front.z - long;
    if (rear.v > front.v) rear.v = Math.max(MIN_SPEED, front.v);
    const away = dx === 0 ? (i % 2 ? 1 : -1) : (dx > 0 ? 1 : -1);
    a.x = Math.max(-edge, Math.min(edge, a.x + away * 0.16));
    b.x = Math.max(-edge, Math.min(edge, b.x - away * 0.16));
  }
}

export const MAX_RACE_TICKS = 300 * TICKS_PER_SECOND;

export function replay(world: World, car: CarStats, inputs: number[]): { finished: boolean; ticks: number; seconds: number; hits: number; pedHits: number } {
  const r = newRacer(world, car);
  for (let i = 0; i < inputs.length && i < MAX_RACE_TICKS && r.finishedAt === 0; i++) step(world, car, r, unpackInput(inputs[i]));
  return { finished: r.finishedAt > 0, ticks: r.finishedAt, seconds: r.finishedAt * DT, hits: r.hits, pedHits: r.pedHits };
}
