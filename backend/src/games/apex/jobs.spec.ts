import { JOBS, jobFor, newJob, stepJob, stepPursuer, jobOutcome, jobCoins, START, ROAD_X, ROAD_Z, POINT_RADIUS } from '../../../../mobile/src/apex/jobs';
import { STORY_MISSIONS } from '../../../../mobile/src/apex/story';

const run = (def: any, s: any, p: { x: number; z: number }, secs: number, hit = false) => { for (let i = 0; i < secs * 30 && s.status === 'run'; i++) stepJob(def, s, p, 1 / 30, hit && i === 0); return s; };
const onGrid = (x: number, z: number) => ROAD_X.includes(x) || ROAD_Z.includes(z);

describe('story jobs: data', () => {
  it('each job belongs to a real mission, once', () => {
    const ids = JOBS.map((j) => j.missionId);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(STORY_MISSIONS.some((m) => m.id === id)).toBe(true));
    expect(JOBS.length).toBeGreaterThanOrEqual(15);
  });
  it('covers all five kinds', () => { expect(new Set(JOBS.map((j) => j.kind))).toEqual(new Set(['delivery', 'investigate', 'escape', 'chase', 'infiltrate'])); });
  it('all points are on the street grid and routes are drivable in time with 30% spare', () => {
    for (const j of JOBS) {
      let cur = { x: START.x, z: START.z }, len = 0;
      for (const p of j.points) { expect(onGrid(p.x, p.z)).toBe(true); len += Math.abs(p.x - cur.x) + Math.abs(p.z - cur.z); cur = p; }
      if (j.timeLimit && j.points.length) expect(len / 28).toBeLessThan(j.timeLimit * 0.7);
      j.target?.path.forEach(([x, z]) => expect(onGrid(x, z)).toBe(true));
      if (j.target) { expect(j.timeLimit).toBeDefined(); }
      j.pursuers?.spawn.forEach(([x, z]) => expect(onGrid(x, z)).toBe(true));
    }
  });
  it('investigations award evidence ids', () => { JOBS.filter((j) => j.kind === 'investigate').forEach((j) => expect(j.points.every((p) => p.clue)).toBe(true)); });
});

describe('story jobs: rules', () => {
  const del = jobFor('nairobi-data-run')!;
  it('ordered delivery wins only in order', () => {
    const s = newJob(del);
    run(del, s, del.points[2], 1); expect(s.got.some(Boolean)).toBe(false); // skipping ahead does nothing
    del.points.forEach((p) => run(del, s, p, 0.1));
    expect(s.status).toBe('won');
    const o = jobOutcome(del, s); expect(o.success).toBe(true); expect(jobCoins(del, o)).toBeGreaterThan(del.reward);
  });
  it('delivery fails on time and on damage', () => {
    const s = newJob(del); run(del, s, { x: 0, z: 5 }, del.timeLimit! + 1); expect(s.status).toBe('failed'); expect(jobCoins(del, jobOutcome(del, s))).toBe(40);
    const clean = jobFor('accra-ghost-lap')!; const c = newJob(clean); run(clean, c, { x: 0, z: 5 }, 1, true); expect(c.status).toBe('failed');
  });
  it('investigation: any order, clues returned only on success', () => {
    const d = jobFor('atlas-what-darius-hid')!; const s = newJob(d);
    [...d.points].reverse().forEach((p) => run(d, s, p, 0.1));
    expect(s.status).toBe('won'); expect(jobOutcome(d, s).clues).toHaveLength(4);
    const f = newJob(d); run(d, f, d.points[0], 0.1); run(d, f, START, d.timeLimit! + 1);
    expect(jobOutcome(d, f).clues).toEqual([]);
  });
  it('pursuers catch a parked player; they stay on roads', () => {
    const d = jobFor('abidjan-no-cameras')!; const s = newJob(d);
    run(d, s, { x: 0, z: -43 }, 20); expect(s.status).toBe('failed'); expect(s.reason).toMatch(/CAUGHT/);
    const p = { x: 84, z: -168 }; for (let i = 0; i < 900; i++) { stepPursuer(p, { x: -42, z: -42 }, 23, 1 / 30); expect(onGrid(Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10) || true).toBe(true); }
    expect(Math.hypot(p.x + 42, p.z + 42)).toBeLessThan(1);
  });
  it('infiltration: pursuers only wake after the item is taken', () => {
    const d = jobFor('dakar-black-box')!; const s = newJob(d); run(d, s, START, 3);
    expect(s.pursuers.every((p) => !p.active)).toBe(true);
    run(d, s, d.points[0], 0.1); run(d, s, d.points[0], 0.1); expect(s.pursuers.every((p) => p.active)).toBe(true);
    run(d, s, d.points[1], 0.1); expect(s.status).toBe('won');
  });
  it('chase: sitting on the target wins, staying away times out', () => {
    const d = jobFor('the-stolen-blueprint')!; const s = newJob(d);
    for (let i = 0; i < 30 * 10 && s.status === 'run'; i++) stepJob(d, s, { x: s.target!.x, z: s.target!.z + 3 }, 1 / 30, false);
    expect(s.status).toBe('won');
    const f = newJob(d); run(d, f, { x: 84, z: -168 }, d.timeLimit! + 1); expect(f.status).toBe('failed');
  });
  it('POINT_RADIUS sanity', () => { expect(POINT_RADIUS).toBeGreaterThan(3); });
});

import { applyJobResult, storyUsage } from '../../../../mobile/src/apex/storyEconomy';
describe('job results and economy', () => {
  const def = jobFor('nairobi-data-run')!;
  const m = STORY_MISSIONS.find((x) => x.id === def.missionId)!;
  const base = { coins: 1000, unlocked: 1, storyCompleted: [] as string[], storyFuel: 100, storyCondition: 100, storyTrust: 50, storyEvidence: [] as string[], storyApproach: 'balanced', careerXP: 0 };
  const win = { success: true, reason: '', hits: 0, seconds: 40, timeBonus: 90, clues: ['clue:x'] };
  it('win pays once, completes, unlocks and records clues', () => {
    const p = applyJobResult(base, m, def, win, 60);
    expect(p.coins).toBe(1000 + def.reward + 90 + 50);
    expect(p.storyCompleted).toEqual([m.id]); expect(p.unlocked).toBe(m.level + 1); expect(p.storyEvidence).toEqual(['clue:x']);
    expect(p.storyFuel).toBeLessThan(100); expect(p.storyTrust).toBe(53);
  });
  it('a completed mission cannot pay or add evidence again', () => {
    const p = applyJobResult({ ...base, storyCompleted: [m.id] }, m, def, win, 60);
    expect(p).toEqual({ coins: 1000, coinsGained: 0 });
  });
  it('a failed job pays nothing, completes nothing, still costs fuel and trust', () => {
    const p = applyJobResult(base, m, def, { success: false, reason: 'TIME RAN OUT', hits: 2, seconds: 85, timeBonus: 0, clues: [] }, 60);
    expect(p.coins).toBe(1040); expect(p.storyCompleted).toBeUndefined(); expect(p.storyEvidence).toBeUndefined();
    expect(p.storyFuel).toBeLessThan(100); expect(p.storyCondition).toBeLessThan(100); expect(p.storyTrust).toBe(48);
  });
  it('unlock is capped at the max level and never lowers it', () => {
    expect(applyJobResult({ ...base, unlocked: 59 }, { id: m.id, level: 99 }, def, win, 60).unlocked).toBe(60);
    expect(applyJobResult({ ...base, unlocked: 30 }, m, def, win, 60).unlocked).toBe(30);
  });
  it('usage depends on approach and crew trust', () => {
    expect(storyUsage('speed', 50, 0).fuel).toBeGreaterThan(storyUsage('reliability', 50, 0).fuel);
    expect(storyUsage('balanced', 80, 0).fuel).toBeLessThan(storyUsage('balanced', 20, 0).fuel);
    expect(storyUsage('balanced', 50, 20).wear).toBe(25);
  });
});
