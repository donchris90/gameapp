import { driftAt, CAR_HALF_W, CarStats, DT, Entity, Input, LANES, PED_SPEED, ROAD_HALF, Racer, World, laneX, poseOf, rng } from './sim';

/**
 * Deterministic computer driver shared by the app and server.
 * Skill affects look-ahead, reaction frequency, steering smoothness and mistakes.
 */
export type DriverStyle = 'aggressive' | 'balanced' | 'defensive';
export interface Driver { skill: number; style: DriverStyle; next: () => number; target: number; recheck: number; mistake: boolean; brakeFor: number; steer: number }

export function newDriver(seed: number, skill: number): Driver {
  const style: DriverStyle = Math.abs(Math.floor(seed)) % 3 === 0 ? 'aggressive' : Math.abs(Math.floor(seed)) % 3 === 1 ? 'balanced' : 'defensive';
  return { skill: Math.max(0, Math.min(1, skill)), style, next: rng(seed), target: 1, recheck: 0, mistake: false, brakeFor: 0, steer: 0 };
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

export function drive(world: World, car: CarStats, r: Racer, d: Driver, racers: Racer[] = []): Input {
  const styleLook = d.style === 'defensive' ? 0.18 : d.style === 'aggressive' ? -0.08 : 0;
  const look = r.v * (0.8 + d.skill * 0.9 + styleLook) + 14;
  const tt = r.tick * DT;
  const cur = Math.max(0, Math.min(LANES - 1, Math.round(r.x / 3.2 + 1.5)));
  if (d.recheck-- <= 0) {
    d.recheck = Math.round(9 - d.skill * 5 + (d.style === 'defensive' ? 1 : d.style === 'aggressive' ? -1 : 0));
    const near = nearby(world, r, look * 1.5);
    // Forward clearance: estimate where traffic and moving bikes will be when we reach them.
    const room = (lane: number, horizon: number) => {
      let best = horizon;
      const cx = laneX(lane);
      for (const other of racers) {
        if (other === r || other.finishedAt > 0) continue;
        const ahead = other.z - r.z;
        if (ahead < -5 || ahead > horizon + 18) continue;
        if (Math.abs(other.x - cx) < CAR_HALF_W * 2 + 0.35) {
          const closing = Math.max(5, r.v - other.v);
          const timeToMeet = Math.max(0, ahead) / closing;
          const predictedGap = ahead + (other.v - r.v) * Math.min(timeToMeet, 1.2);
          best = Math.min(best, Math.max(0, predictedGap));
        }
      }
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
        const closing = Math.max(5, r.v - e.speed);
        const q = poseOf(e, tt + Math.max(0, ahead) / closing, -1);
        if (Math.abs(q.x - cx) < e.w / 2 + CAR_HALF_W + 0.6 || Math.abs(p.x - cx) < e.w / 2 + CAR_HALF_W + 0.6) best = Math.min(best, Math.max(0, ahead));
      }
      return best;
    };
    // A faster rival approaching from behind can make a lane change unsafe. Keep
    // this separate from forward clearance so it never triggers needless braking.
    const rearThreat = (lane: number) => {
      const cx = laneX(lane);
      for (const other of racers) {
        if (other === r || other.finishedAt > 0) continue;
        const gap = other.z - r.z;
        if (gap >= -1 || gap < -look * 0.6 || other.v <= r.v) continue;
        if (Math.abs(other.x - cx) >= CAR_HALF_W * 2 + 0.35) continue;
        if (-gap / Math.max(1, other.v - r.v) < 1.5 + d.skill * 0.5) return true;
      }
      return false;
    };

    let bestLane = cur, bestScore = -1e9;
    const currentRoom = room(cur, look * 1.15);
    for (let lane = 0; lane < LANES; lane++) {
      const r0 = room(lane, look * 1.4);
      let blockedCrossing = false;
      const lo = Math.min(cur, lane), hi = Math.max(cur, lane);
      for (let l = lo; l <= hi; l++) {
        if (l === lane) continue;
        if (room(l, 16 + r.v * 0.35) < 16 + r.v * 0.35 || rearThreat(l)) blockedCrossing = true;
      }
      const laneChange = Math.abs(lane - cur);
      const overtakeFactor = d.style === 'aggressive' ? 0.15 + d.skill * 0.07 : d.style === 'defensive' ? 0.05 + d.skill * 0.04 : 0.08 + d.skill * 0.06;
      const overtakeValue = Math.max(0, r0 - currentRoom) * overtakeFactor;
      const baseStability = d.style === 'aggressive' ? 3.4 : d.style === 'defensive' ? 5.8 : 4.5;
      const stabilityPenalty = laneChange * (baseStability - d.skill * 1.5);
      const targetBonus = lane === d.target ? 2.5 : 0;
      const rearPenalty = rearThreat(lane) ? (d.style === 'defensive' ? 32 : d.style === 'aggressive' ? 17 : 24) : 0;
      const score = r0 + overtakeValue + targetBonus - stabilityPenalty - rearPenalty - (blockedCrossing ? 8 : 0);
      if (score > bestScore) { bestScore = score; bestLane = lane; }
    }
    d.target = bestLane;
    const brakeMargin = d.style === 'defensive' ? 18 : d.style === 'aggressive' ? 11 : 14;
    const speedMargin = d.style === 'defensive' ? 0.15 : d.style === 'aggressive' ? 0.09 : 0.12;
    d.brakeFor = room(bestLane, 34) < brakeMargin + r.v * speedMargin ? 1 : 0;
    const mistakeRate = d.style === 'aggressive' ? 0.14 : d.style === 'defensive' ? 0.07 : 0.12;
    d.mistake = d.next() < mistakeRate * (1 - d.skill);
    if (d.mistake) d.target = Math.min(LANES - 1, Math.max(0, d.target + (d.next() < 0.5 ? -1 : 1)));
  }

  const dx = laneX(d.target) - r.x;
  const grip = (1 - 0.22 * Math.min(1, r.v / Math.max(1, car.vmax))) * (0.72 + 0.28 * Math.min(1, r.v / 24));
  const lookAhead = Math.max(20, r.v * (0.45 + d.skill * 0.2));
  const push = driftAt(world, r.z + lookAhead, r.v) / Math.max(3, car.handling * grip);
  const desiredSteer = Math.max(-1, Math.min(1, dx * 0.62 - push * (0.82 + 0.18 * d.skill)));
  const steerResponse = d.style === 'aggressive' ? 0.3 + d.skill * 0.12 : d.style === 'defensive' ? 0.16 + d.skill * 0.1 : 0.22 + d.skill * 0.12;
  d.steer += (desiredSteer - d.steer) * steerResponse;
  const bendLoad = Math.abs(push);
  const bendLimit = d.style === 'defensive' ? 0.78 - d.skill * 0.06 : d.style === 'aggressive' ? 1.08 - d.skill * 0.05 : 0.94 - d.skill * 0.08;
  const brake = (d.brakeFor === 1 && r.v > 16) || (bendLoad > bendLimit && r.v > 24);
  const nitroBendLimit = d.style === 'aggressive' ? 0.8 : d.style === 'defensive' ? 0.48 : 0.62;
  const nitroChance = d.style === 'aggressive' ? 0.55 : d.style === 'defensive' ? 0.25 : 0.4;
  const clear = !brake && Math.abs(dx) < 0.5 && r.nitro > 0.6 && bendLoad < nitroBendLimit;
  return { steer: Math.max(-1, Math.min(1, d.steer)), brake, nitro: clear && d.skill > 0.2 && d.next() < nitroChance };
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
