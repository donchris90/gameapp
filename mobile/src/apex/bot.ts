import { driftAt, CAR_HALF_W, CarStats, DT, Entity, Input, LANES, PED_SPEED, ROAD_HALF, Racer, World, laneX, poseOf, rng } from './sim';

/**
 * A computer driver. It looks down the road for the lane with the most room, steers there (checking the lanes it has to
 * cross), swerves round people stepping out and brakes only when every lane is blocked, and uses nitro on clear stretches.
 * `skill` (0 to 1) sets how far ahead it looks, how fast it reacts and how often it makes a mistake, so a low level meets
 * sloppy drivers and a high level meets sharp ones.
 */
export interface Driver { skill: number; next: () => number; target: number; recheck: number; mistake: boolean; brakeFor: number }

export function newDriver(seed: number, skill: number): Driver {
  return { skill: Math.max(0, Math.min(1, skill)), next: rng(seed), target: 1, recheck: 0, mistake: false, brakeFor: 0 };
}

/** Where a pedestrian will be when a car at `r` gets to its spot. */
function pedAt(e: Entity, r: Racer, tt: number, arrivedAt: number): number {
  const reach = Math.max(0, (e.z - r.z) / Math.max(10, r.v));
  const side = ROAD_HALF + 1.6;
  const startsAt = arrivedAt >= 0 ? arrivedAt : tt + Math.max(0, (e.z - e.trigger - r.z) / Math.max(10, r.v));
  const walked = PED_SPEED * Math.max(0, tt + reach - startsAt);
  const x = -e.dir * side + e.dir * walked;
  return e.dir > 0 ? Math.min(x, side) : Math.max(x, -side);
}

export function drive(world: World, car: CarStats, r: Racer, d: Driver): Input {
  const look = r.v * (0.8 + d.skill * 0.9) + 14;
  const tt = r.tick * DT;
  const cur = Math.max(0, Math.min(LANES - 1, Math.round(r.x / 3.2 + 1.5)));
  if (d.recheck-- <= 0) {
    d.recheck = Math.round(10 - d.skill * 6); // ticks until it looks again
    const near = nearby(world, r, look * 1.5);
    const room = (lane: number, horizon: number) => {
      let best = horizon;
      const cx = laneX(lane);
      for (const e of near) {
        if (e.kind === 'ped') {
          const ahead = e.z - r.z;
          if (ahead < -1 || ahead > horizon) continue;
          const px = pedAt(e, r, tt, r.arrived[world.peds.indexOf(e.id)]);
          if (Math.abs(px - cx) < 1.6 + CAR_HALF_W) best = Math.min(best, Math.max(0, ahead));
          continue;
        }
        const p = poseOf(e, tt, -1);
        const ahead = p.z - r.z - e.l / 2;
        if (ahead < -3 || ahead > horizon) continue;
        // by the time we get there the other vehicle has moved on (and a bike may have drifted)
        const closing = Math.max(5, r.v - e.speed);
        const q = poseOf(e, tt + Math.max(0, ahead) / closing, -1);
        if (Math.abs(q.x - cx) < e.w / 2 + CAR_HALF_W + 0.6 || Math.abs(p.x - cx) < e.w / 2 + CAR_HALF_W + 0.6) best = Math.min(best, Math.max(0, ahead));
      }
      return best;
    };
    let bestLane = cur, bestScore = -1e9;
    for (let lane = 0; lane < LANES; lane++) {
      let r0 = room(lane, look * 1.4);
      // lanes it has to cross on the way must be clear for a short stretch
      const lo = Math.min(cur, lane), hi = Math.max(cur, lane);
      for (let l = lo; l <= hi; l++) if (l !== lane && room(l, 16 + r.v * 0.35) < 16 + r.v * 0.35) r0 = Math.min(r0, 4);
      const score = r0 - Math.abs(lane - cur) * 5;
      if (score > bestScore) { bestScore = score; bestLane = lane; }
    }
    d.target = bestLane;
    d.brakeFor = room(bestLane, 38) < 20 + r.v * 0.15 ? 1 : 0; // even the best lane is blocked close ahead
    d.mistake = d.next() < 0.12 * (1 - d.skill);
    if (d.mistake) d.target = Math.min(LANES - 1, Math.max(0, d.target + (d.next() < 0.5 ? -1 : 1)));
  }
  const dx = laneX(d.target) - r.x;
  // bends: lean against the push towards the outside, and lift off when it is more than the car can hold
  const grip = 0.65 + 0.35 * Math.min(1, r.v / 30);
  const push = driftAt(world, r.z + 12, r.v) / (car.handling * grip);
  const steer = Math.max(-1, Math.min(1, dx * 0.9 - push * (0.8 + 0.2 * d.skill)));
  const brake = (d.brakeFor === 1 && r.v > 16) || (Math.abs(push) > 0.9 && r.v > 24);
  const clear = !brake && Math.abs(dx) < 0.5 && r.nitro > 0.6;
  return { steer, brake, nitro: clear && d.skill > 0.2 && d.next() < 0.4 };
}

function nearby(world: World, r: Racer, range: number): Entity[] {
  const out: Entity[] = [];
  const es = world.entities;
  const tt = r.tick * DT;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    const z = e.kind === 'ped' ? e.z : e.z + e.speed * tt;
    if (z < r.z - 8) continue;
    if (e.z > r.z + range + 60) break;
    if (z <= r.z + range) out.push(e);
  }
  return out;
}
