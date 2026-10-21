/**
 * Story jobs: missions that are NOT a normal race. They are played in the Lagos street grid (DriveMission.tsx)
 * and the rules live here as plain data and pure functions, so they can be tested without a phone.
 *
 *  delivery    reach the points in order before the time runs out, without wrecking the cargo
 *  investigate visit every clue in any order; a search crew may arrive and hunt you
 *  escape      reach the safe point while pursuers try to catch you
 *  chase       stay close to a fleeing target long enough
 *  infiltrate  reach the target, take the item, then get out with pursuers on your tail
 */
export type JobKind = 'delivery' | 'investigate' | 'escape' | 'chase' | 'infiltrate';
export interface JobPoint { x: number; z: number; label: string; clue?: string }
export interface JobDef {
  missionId: string; kind: JobKind;
  intro: string; goal: string;
  points: JobPoint[]; ordered: boolean;
  timeLimit?: number;          // seconds; absent = no timer
  maxHits: number;             // collisions the cargo / car can take before the job fails
  pursuers?: { count: number; speed: number; spawn: Array<[number, number]>; afterPoint?: number; afterSeconds?: number };
  target?: { path: Array<[number, number]>; speed: number; holdSeconds: number; decoys: number };
  reward: number;
}

/** The street grid every job is driven on (same as LagosDrive / lagosWorld). */
export const ROAD_X = [-84, -42, 0, 42, 84];
export const ROAD_Z = [-168, -105, -42];
export const START = { x: 0, z: 5 };
export const POINT_RADIUS = 7;
export const CATCH_RADIUS = 4.6;
export const CATCH_SECONDS = 2.5;
export const TARGET_RADIUS = 9;

const P = (x: number, z: number, label: string, clue?: string): JobPoint => ({ x, z, label, clue });

export const JOBS: JobDef[] = [
  { missionId: 'the-stolen-blueprint', kind: 'chase', intro: 'The thief is already moving. Stay on the car with the notebook.', goal: 'Stay close to the thief’s car for 4 seconds in total.',
    points: [], ordered: false, timeLimit: 75, maxHits: 6,
    target: { path: [[0, -42], [42, -42], [42, -105], [-42, -105], [-42, -168], [84, -168], [84, -42], [0, -42]], speed: 25, holdSeconds: 4, decoys: 0 }, reward: 320 },
  { missionId: 'abidjan-missing-courier', kind: 'chase', intro: 'Follow the courier’s vehicle trail before Vanguard’s crew gets there.', goal: 'Close in on the courier’s car and hold on for 5 seconds.',
    points: [], ordered: false, timeLimit: 80, maxHits: 5,
    target: { path: [[0, -105], [-42, -105], [-42, -42], [-84, -42], [-84, -168], [0, -168], [0, -105]], speed: 26, holdSeconds: 5, decoys: 0 }, reward: 380 },
  { missionId: 'namib-ghost-convoy', kind: 'chase', intro: 'Three identical trucks. Only the one with the glowing marker carries the prototype.', goal: 'Intercept the marked truck: hold within range for 5 seconds.',
    points: [], ordered: false, timeLimit: 85, maxHits: 4,
    target: { path: [[42, -42], [42, -168], [-42, -168], [-42, -42], [42, -42]], speed: 27, holdSeconds: 5, decoys: 2 }, reward: 480 },

  { missionId: 'accra-ghost-lap', kind: 'delivery', intro: 'Get the data drive from the courier and bring it back clean. One scratch and the proof is damaged.', goal: 'Collect the drive, reach every stop in order, with zero collisions.',
    points: [P(0, -42, 'COURIER'), P(42, -42, 'DROP-ONE'), P(42, -105, 'SIDE STREET'), P(-42, -105, 'OLD DEPOT'), P(-42, -42, 'ORGANISERS')], ordered: true, timeLimit: 70, maxHits: 0, reward: 360 },
  { missionId: 'nairobi-data-run', kind: 'delivery', intro: 'A precise test route to prove you can be trusted with telemetry.', goal: 'Hit every marked point in order before time runs out.',
    points: [P(0, -42, 'GATE'), P(-42, -42, 'LEFT TURN'), P(-42, -105, 'LOADING BAY'), P(42, -105, 'CROSSOVER'), P(42, -168, 'SUPPLIER'), P(0, -168, 'ACCESS DOOR')], ordered: true, timeLimit: 85, maxHits: 3, reward: 420 },
  { missionId: 'namib-signal-dawn', kind: 'delivery', intro: 'The recording is on a relay. Reach every relay point and secure the full signal.', goal: 'Reach the four relay points in order.',
    points: [P(42, -42, 'RELAY ONE'), P(84, -105, 'RELAY TWO'), P(0, -105, 'RELAY THREE'), P(-42, -168, 'SIGNAL SOURCE')], ordered: true, timeLimit: 75, maxHits: 3, reward: 500 },
  { missionId: 'victoria-crossing', kind: 'delivery', intro: 'The usual route is closed. Find another way and keep the supplies moving.', goal: 'Take the supplies through every checkpoint in order.',
    points: [P(-42, -42, 'DETOUR'), P(-84, -105, 'BROKEN ROAD'), P(-42, -168, 'OLD BRIDGE'), P(42, -168, 'WAREHOUSE'), P(84, -105, 'RENDEZVOUS')], ordered: true, timeLimit: 90, maxHits: 4, reward: 520 },

  { missionId: 'abidjan-no-cameras', kind: 'escape', intro: 'The meeting was a trap. Lose the surveillance crew and reach the safe garage.', goal: 'Reach the safe garage without being caught or wrecking the car.',
    points: [P(42, -42, 'CUT THROUGH'), P(42, -168, 'BACK ALLEY'), P(-42, -168, 'SAFE GARAGE')], ordered: true, timeLimit: 80, maxHits: 3,
    pursuers: { count: 2, speed: 22, spawn: [[0, -42], [-84, -42]] }, reward: 400 },
  { missionId: 'nairobi-wrong-passenger', kind: 'escape', intro: 'Your passenger is carrying the files. A crew is trying to force you off the road.', goal: 'Get the passenger to the pick-up point. Few collisions allowed.',
    points: [P(0, -105, 'FIRST TURN'), P(84, -105, 'OPEN ROAD'), P(84, -168, 'PICK-UP')], ordered: true, timeLimit: 75, maxHits: 2,
    pursuers: { count: 3, speed: 23, spawn: [[0, -42], [-42, -105], [42, -42]] }, reward: 460 },

  { missionId: 'namib-wreck-marker', kind: 'investigate', intro: 'Search the wreck site for the data module. Go gently: the equipment is fragile.', goal: 'Find all four parts of the wreck before the search crew arrives.',
    points: [P(-42, -42, 'MARKER', 'clue:namib-marker'), P(42, -105, 'WRECK', 'clue:namib-wreck'), P(-84, -105, 'SKID TRAIL', 'clue:namib-trail'), P(0, -168, 'DATA MODULE', 'clue:namib-module')], ordered: false, timeLimit: 110, maxHits: 2,
    pursuers: { count: 2, speed: 21, spawn: [[84, -42], [84, -168]], afterSeconds: 55 }, reward: 450 },
  { missionId: 'atlas-what-darius-hid', kind: 'investigate', intro: 'Darius’s old record points to a hidden storage site. Check every place it mentions.', goal: 'Visit all four locations on Darius’s list.',
    points: [P(42, -42, 'STORAGE UNIT', 'clue:atlas-unit'), P(-42, -105, 'OLD GARAGE', 'clue:atlas-garage'), P(84, -168, 'SCRAP YARD', 'clue:atlas-yard'), P(-84, -42, 'SERIAL PLATE', 'clue:atlas-plate')], ordered: false, timeLimit: 120, maxHits: 6, reward: 420 },

  { missionId: 'dakar-black-box', kind: 'infiltrate', intro: 'Secure the damaged recorder. Vanguard’s agents are closing in.', goal: 'Take the recorder, then reach the exit before the agents catch you.',
    points: [P(-42, -105, 'RECORDER'), P(84, -42, 'EXIT')], ordered: true, timeLimit: 75, maxHits: 4,
    pursuers: { count: 2, speed: 23, spawn: [[0, -168], [42, -105]], afterPoint: 1 }, reward: 440 },
  { missionId: 'cairo-project-files', kind: 'infiltrate', intro: 'Mara found the route to the Project Apex files. They will be wiped soon.', goal: 'Copy the files, then get out of the district.',
    points: [P(0, -105, 'SERVER ROOM', 'clue:cairo-files'), P(-84, -168, 'GETAWAY')], ordered: true, timeLimit: 70, maxHits: 4,
    pursuers: { count: 2, speed: 24, spawn: [[42, -42], [-42, -168]], afterPoint: 1 }, reward: 500 },
  { missionId: 'cape-garage-raid', kind: 'infiltrate', intro: 'They took the evidence and sabotaged the car. Recover the parts and get back.', goal: 'Recover both parts, then reach the workshop.',
    points: [P(42, -105, 'STOLEN PART'), P(-42, -168, 'STOLEN EVIDENCE', 'clue:cape-evidence'), P(0, -42, 'WORKSHOP')], ordered: true, timeLimit: 90, maxHits: 3,
    pursuers: { count: 3, speed: 24, spawn: [[84, -168], [-84, -42], [0, -105]], afterPoint: 1 }, reward: 560 },
  { missionId: 'johannesburg-control-room', kind: 'infiltrate', intro: 'Sloane is erasing the logs. Reach the facility, copy the control data and escape.', goal: 'Reach the control room, copy the logs, then escape the district.',
    points: [P(0, -105, 'FACILITY'), P(42, -105, 'CONTROL ROOM', 'clue:johannesburg-logs'), P(-84, -42, 'ESCAPE ROUTE')], ordered: true, timeLimit: 85, maxHits: 3,
    pursuers: { count: 3, speed: 25, spawn: [[-42, -168], [84, -105], [0, -168]], afterPoint: 2 }, reward: 650 },
];

export const JOB_BY_MISSION: Record<string, JobDef> = Object.fromEntries(JOBS.map((j) => [j.missionId, j]));
export const jobFor = (missionId: string): JobDef | undefined => JOB_BY_MISSION[missionId];

const KIND_LABEL: Record<JobKind, string> = { delivery: 'DELIVERY', investigate: 'INVESTIGATION', escape: 'ESCAPE', chase: 'CHASE', infiltrate: 'INFILTRATION' };
export const jobKindLabel = (k: JobKind) => KIND_LABEL[k];

export interface Pt { x: number; z: number }
export interface JobState {
  t: number; hits: number;
  got: boolean[];                  // which points are collected
  pursuers: Array<Pt & { active: boolean }>;
  caught: number;                  // seconds of contact with a pursuer
  target: (Pt & { seg: number }) | null;
  decoys: Array<Pt & { seg: number }>;
  hold: number;                    // chase: seconds spent in range
  status: 'run' | 'won' | 'failed';
  reason: string;
}

export function newJob(def: JobDef): JobState {
  const sp = def.pursuers?.spawn ?? [];
  const pursuers = def.pursuers ? Array.from({ length: def.pursuers.count }, (_, i) => ({ x: sp[i % sp.length][0], z: sp[i % sp.length][1], active: false })) : [];
  const path = def.target?.path;
  const target = path ? { x: path[0][0], z: path[0][1], seg: 1 } : null;
  const decoys = path && def.target ? Array.from({ length: def.target.decoys }, (_, i) => { const s = Math.min(path.length - 1, i + 1); return { x: path[s][0], z: path[s][1], seg: Math.min(path.length - 1, s + 1) }; }) : [];
  return { t: 0, hits: 0, got: def.points.map(() => false), pursuers, caught: 0, target, decoys, hold: 0, status: 'run', reason: '', };
}

/** index of the next point to collect (ordered jobs) or -1 when none left */
export const nextPoint = (def: JobDef, s: JobState) => def.points.findIndex((_, i) => !s.got[i]);
export const collected = (s: JobState) => s.got.filter(Boolean).length;
export const timeLeft = (def: JobDef, s: JobState) => def.timeLimit === undefined ? Infinity : Math.max(0, def.timeLimit - s.t);

const nearest = (v: number, arr: number[]) => arr.reduce((b, a) => (Math.abs(a - v) < Math.abs(b - v) ? a : b));

/** Pursuers drive only on the street grid: along a road, turning at junctions. */
export function stepPursuer(p: Pt, to: Pt, speed: number, dt: number) {
  const step = speed * dt, eps = 1e-6;
  const rx = nearest(p.x, ROAD_X), rz = nearest(p.z, ROAD_Z);
  const onV = Math.abs(p.x - rx) < eps, onH = Math.abs(p.z - rz) < eps;
  const dx = to.x - p.x, dz = to.z - p.z;
  const go = (axis: 'x' | 'z', d: number) => { p[axis] += Math.sign(d) * Math.min(Math.abs(d), step); };
  // The junction to head for when the pursuer wants to turn: the next one ahead (or the nearest if already level with the target).
  const junction = (v: number, roads: number[], d: number) => {
    if (Math.abs(d) < step) return nearest(v, roads);
    const ahead = roads.filter((r) => (r - v) * Math.sign(d) > eps).sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0];
    return ahead ?? nearest(v, roads);
  };
  const reach = (axis: 'x' | 'z', j: number) => { if (Math.abs(j - p[axis]) <= step) p[axis] = j; else go(axis, j - p[axis]); };
  if (!onV && !onH) { if (Math.abs(rx - p.x) <= Math.abs(rz - p.z)) go('x', rx - p.x); else go('z', rz - p.z); return; }
  if (onV && onH) { if (Math.abs(dx) > Math.abs(dz)) go('x', dx); else go('z', dz); return; }
  if (onV) { if (Math.abs(dx) > Math.abs(dz)) reach('z', junction(p.z, ROAD_Z, dz)); else go('z', dz); return; }
  if (Math.abs(dz) > Math.abs(dx)) reach('x', junction(p.x, ROAD_X, dx)); else go('x', dx);
}

function stepFollower(f: Pt & { seg: number }, path: Array<[number, number]>, speed: number, dt: number) {
  let left = speed * dt;
  while (left > 0) {
    const [tx, tz] = path[f.seg]; const d = Math.hypot(tx - f.x, tz - f.z);
    if (d <= left) { f.x = tx; f.z = tz; left -= d; f.seg = (f.seg + 1) % path.length; if (f.seg === 0) f.seg = 1; if (d === 0 && left === speed * dt) break; }
    else { f.x += ((tx - f.x) / d) * left; f.z += ((tz - f.z) / d) * left; left = 0; }
  }
}

/** One simulation step. `hit` = the player collided this frame (edge-detected by the caller). Mutates and returns `s`. */
export function stepJob(def: JobDef, s: JobState, player: Pt, dt: number, hit: boolean): JobState {
  if (s.status !== 'run') return s;
  s.t += dt;
  if (hit) s.hits++;
  if (s.hits > def.maxHits) { s.status = 'failed'; s.reason = def.kind === 'delivery' ? 'THE CARGO WAS DAMAGED' : 'TOO MUCH DAMAGE'; return s; }

  // points
  if (def.points.length) {
    const idx = def.ordered ? nextPoint(def, s) : -1;
    const test = (i: number) => { if (!s.got[i] && Math.hypot(def.points[i].x - player.x, def.points[i].z - player.z) < POINT_RADIUS) s.got[i] = true; };
    if (def.ordered) { if (idx >= 0) test(idx); } else def.points.forEach((_, i) => test(i));
  }
  const done = def.points.length > 0 && s.got.every(Boolean);

  // pursuers
  const pc = def.pursuers;
  if (pc) {
    const activate = (pc.afterPoint === undefined && pc.afterSeconds === undefined) || (pc.afterPoint !== undefined && collected(s) >= pc.afterPoint) || (pc.afterSeconds !== undefined && s.t >= pc.afterSeconds);
    let touching = false;
    for (const p of s.pursuers) {
      if (activate) p.active = true;
      if (!p.active) continue;
      stepPursuer(p, player, pc.speed, dt);
      if (Math.hypot(p.x - player.x, p.z - player.z) < CATCH_RADIUS) touching = true;
    }
    s.caught = touching ? s.caught + dt : Math.max(0, s.caught - dt * 0.5);
    if (s.caught >= CATCH_SECONDS) { s.status = 'failed'; s.reason = 'THEY CAUGHT YOU'; return s; }
  }

  // chase target
  const tc = def.target;
  if (tc && s.target) {
    const path = tc.path;
    stepFollower(s.target, path, tc.speed, dt);
    s.decoys.forEach((d) => stepFollower(d, path, tc.speed * 0.96, dt));
    const near = Math.hypot(s.target.x - player.x, s.target.z - player.z) < TARGET_RADIUS;
    s.hold = near ? s.hold + dt : Math.max(0, s.hold - dt * 0.4);
    if (s.hold >= tc.holdSeconds) { s.status = 'won'; return s; }
  }

  if (done) { s.status = 'won'; return s; }
  if (def.timeLimit !== undefined && s.t >= def.timeLimit) { s.status = 'failed'; s.reason = def.kind === 'investigate' ? 'THE SEARCH RAN OUT OF TIME' : 'TIME RAN OUT'; }
  return s;
}

export interface JobOutcome { success: boolean; reason: string; hits: number; seconds: number; timeBonus: number; clues: string[] }
export function jobOutcome(def: JobDef, s: JobState): JobOutcome {
  const success = s.status === 'won';
  const clues = success ? def.points.filter((p, i) => p.clue && s.got[i]).map((p) => p.clue!) : [];
  const timeBonus = success && def.timeLimit !== undefined ? Math.floor(Math.max(0, def.timeLimit - s.t) * 3) : 0;
  return { success, reason: s.reason, hits: s.hits, seconds: Math.round(s.t * 10) / 10, timeBonus, clues };
}
/** A failed job still pays a small fee, so a player short of coins can always earn the fuel back. */
export const FAIL_FEE = 40;
export const jobCoins = (def: JobDef, o: JobOutcome) => (o.success ? def.reward + o.timeBonus + (o.hits === 0 ? 50 : 0) : FAIL_FEE);
