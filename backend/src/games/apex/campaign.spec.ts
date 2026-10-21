const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({ getItemAsync: async (k: string) => store[k] ?? null, setItemAsync: async (k: string, v: string) => { store[k] = v; } }), { virtual: true });
import { loadApex, saveApex } from '../../../../mobile/src/apex/storage';
import { calculateCareerRewards } from '../../../../mobile/src/apex/career';
import { STORY_MISSIONS, currentStoryMission, AFRICA_CAMPAIGN_REGION_IDS, STORY_TALK } from '../../../../mobile/src/apex/story';
import { EUROPE_MISSIONS, europeMissionComplete } from '../../../../mobile/src/apex/europe';
import { applyNeed, needsFor } from '../../../../mobile/src/apex/storyExtras';
import { applyJobResult, buyFuel, buyRepair } from '../../../../mobile/src/apex/storyEconomy';
import { jobFor, JobOutcome } from '../../../../mobile/src/apex/jobs';
import { settleRace } from '../../../../mobile/src/apex/storySettle';
import { settleRegion, canStartEuropeMission, canStartStoryMission, europeEndingLines, europeFinished, europeUnlocked } from '../../../../mobile/src/apex/storyFlow';

const MAX = 60;
let seed = 1;
const resultFor = (track: string, rank: number, hits = 0) => ({ track, laps: 3, ticks: 3000, rank, hits, pedHits: 0, bestLap: 40, seed: seed++ });
const raw = () => Object.keys(store).find((k) => !k.includes('style')) as string;
let free = 0;
const freeRace = (s: any, rank = 4, level = 1) => {
  free++;
  const r = resultFor('circuit', rank); const rewards = calculateCareerRewards(r, 0);
  return { ...s, ...settleRace({ state: s, result: r, level, rewards, maxLevel: MAX }).patch };
};
/** Plays the cheapest honest path to a mission: only does what the game blocks on. */
function prepare(s: any, id: string) {
  for (let i = 0; i < 400; i++) {
    const c = canStartStoryMission(s, id);
    const m = STORY_MISSIONS.find((x) => x.id === id)!;
    const pending = needsFor(id).find((n) => !(s.storyNeedsDone ?? []).includes(n.id) && applyNeed(s, n.id).ok !== false || (!(s.storyNeedsDone ?? []).includes(n.id) && applyNeed(s, n.id).ok === false && (applyNeed(s, n.id) as any).reason === 'funds'));
    if (c.ok && !pending) return s;
    if (!c.ok && /career level/.test(c.reason)) { s = freeRace(s, 1, s.unlocked); continue; }
    if (!c.ok && /FUEL/.test(c.reason)) { const p = buyFuel(s); s = p ? { ...s, ...p } : freeRace(s); continue; }
    if (!c.ok && /DAMAGED/.test(c.reason)) { const p = buyRepair(s); s = p ? { ...s, ...p } : freeRace(s); continue; }
    if (!c.ok) throw new Error(`blocked at ${id}: ${c.reason} (level ${m.level}, unlocked ${s.unlocked})`);
    if (pending) { const r = applyNeed(s, pending.id); if (r.ok) s = { ...s, ...r.patch }; else if (r.reason === 'funds') s = freeRace(s); else if (r.reason === 'done') s = { ...s, storyNeedsDone: [...(s.storyNeedsDone ?? []), pending.id] }; continue; }
  }
  throw new Error(`could not prepare ${id}`);
}
const win = (s: any, id: string) => {
  const m = STORY_MISSIONS.find((x) => x.id === id)!;
  const job = jobFor(id);
  if (job) {
    const o: JobOutcome = { success: true, reason: '', hits: 0, seconds: 30, timeBonus: 0, clues: job.points.filter((p) => p.clue).map((p) => p.clue!) };
    const p = applyJobResult(s, m, job, o, MAX); const { coinsGained, ...save } = p; void coinsGained; return { ...s, ...save };
  }
  const r = resultFor(m.track, 1); const rewards = calculateCareerRewards(r, 0);
  const out = settleRace({ state: s, mission: m, result: r, level: m.level, rewards, maxLevel: MAX });
  expect(out.storyWon).toBe(true);
  return { ...s, ...out.patch };
};

describe('whole campaign, played through the real rules', () => {
  beforeEach(() => { Object.keys(store).forEach((k) => delete store[k]); });

  it('a fresh game starts at the first Lagos mission and nothing else is startable', async () => {
    const s: any = await loadApex();
    expect(currentStoryMission(s.storyCompleted)?.id).toBe('one-more-start');
    expect(STORY_MISSIONS.slice(1).every((m) => !canStartStoryMission(s, m.id).ok)).toBe(true);
    expect(canStartEuropeMission(s, EUROPE_MISSIONS[0].id).ok).toBe(false);
  });

  it('counts: 7 Lagos + 49 Africa = 56 ordered missions, 10 regions, 12 Europe missions', () => {
    expect(STORY_MISSIONS.filter((m) => m.chapter === 'lagos')).toHaveLength(7);
    expect(STORY_MISSIONS.filter((m) => m.chapter === 'africa')).toHaveLength(49);
    expect(AFRICA_CAMPAIGN_REGION_IDS).toHaveLength(10);
    expect(EUROPE_MISSIONS).toHaveLength(12);
    expect(new Set(EUROPE_MISSIONS.map((m) => m.id)).size).toBe(12);
  });

  it('every story mission can be reached, played and won in order; coins, fuel and levels never trap the player', async () => {
    let s: any = await loadApex();
    for (const m of STORY_MISSIONS) {
      // out-of-order missions are refused
      const other = STORY_MISSIONS.find((x) => x.id !== m.id && !s.storyCompleted.includes(x.id));
      if (other) expect(canStartStoryMission(s, other.id).ok).toBe(false);
      s = prepare(s, m.id);
      s = win(s, m.id);
      expect(s.storyCompleted).toContain(m.id);
      // saving and reloading keeps everything
      await saveApex(s); const back: any = await loadApex();
      expect(back.storyCompleted).toEqual(s.storyCompleted); expect(back.coins).toBe(s.coins);
    }
    expect(s.storyCompleted).toHaveLength(56);
    // the economy needs only a sane amount of free racing on the way
    expect(free).toBeLessThan(120);
    console.log(`free races needed on the cheapest path: ${free}`);
  });

  it('Europe stays locked until all 49 Africa missions AND all ten regions are done, by id', () => {
    const lagos = STORY_MISSIONS.filter((m) => m.chapter === 'lagos').map((m) => m.id);
    const africa = STORY_MISSIONS.filter((m) => m.chapter === 'africa').map((m) => m.id);
    const all = [...lagos, ...africa], regions = [...AFRICA_CAMPAIGN_REGION_IDS];
    const base: any = { storyCompleted: all, africaRegionsCompleted: regions, unlocked: 20, europeCompleted: [] };
    expect(europeUnlocked(all, regions)).toBe(true);
    expect(canStartEuropeMission(base, EUROPE_MISSIONS[0].id).ok).toBe(true);
    expect(europeUnlocked(all.slice(0, -1), regions)).toBe(false);              // finale missing
    expect(europeUnlocked(all.filter((x) => x !== 'africa-accra-welcome'), regions)).toBe(false); // any missing mission
    expect(europeUnlocked(all, regions.slice(1))).toBe(false);                  // a region missing
    expect(europeUnlocked(all, [...regions.slice(1), 'not-a-region'])).toBe(false); // wrong id, right count
    expect(canStartEuropeMission({ ...base, africaRegionsCompleted: regions.slice(1) }, EUROPE_MISSIONS[0].id).ok).toBe(false);
  });

  it('Europe: sequential, track and rank are enforced, failed attempts do not advance, the bonus pays once', async () => {
    let s: any = { ...(await loadApex()), storyCompleted: STORY_MISSIONS.map((m) => m.id), africaRegionsCompleted: [...AFRICA_CAMPAIGN_REGION_IDS], unlocked: 20, coins: 0 };
    expect(europeMissionComplete(EUROPE_MISSIONS[0], { ticks: 100, rank: 1, track: 'nope' })).toBe(false);
    for (let i = 0; i < EUROPE_MISSIONS.length; i++) {
      const m = EUROPE_MISSIONS[i];
      if (i + 1 < EUROPE_MISSIONS.length) expect(canStartEuropeMission(s, EUROPE_MISSIONS[i + 1].id).ok).toBe(false); // no skipping ahead
      expect(canStartEuropeMission(s, m.id).ok).toBe(true);
      // wrong track and failed rank do not complete it
      const wrong = settleRace({ state: s, europe: m, result: resultFor(m.track === 'city' ? 'coast' : 'city', 1), level: m.level, rewards: calculateCareerRewards(resultFor('x', 1), 0), maxLevel: MAX });
      expect(wrong.europeWon).toBe(false);
      const bad = settleRace({ state: s, europe: m, result: resultFor(m.track, 6), level: m.level, rewards: calculateCareerRewards(resultFor(m.track, 6), 0), maxLevel: MAX });
      if (m.requirement !== 'finish') { expect(bad.europeWon).toBe(false); expect(bad.patch.europeCompleted).toEqual(s.europeCompleted ?? []); }
      expect(europeMissionComplete(m, { ticks: 0, rank: 1, track: m.track })).toBe(false); // a result that never ran is never a win
      const res = resultFor(m.track, 1); const rewards = calculateCareerRewards(res, 0);
      const ok = settleRace({ state: s, europe: m, result: res, level: m.level, rewards, maxLevel: MAX });
      expect(ok.europeWon).toBe(true); expect(ok.finalEurope).toBe(i === EUROPE_MISSIONS.length - 1);
      const before = s.coins; s = { ...s, ...ok.patch };
      expect(s.coins - before).toBe(rewards.base + rewards.placement + rewards.clean + rewards.record + m.reward);
      // the same race delivered again (duplicate callback / restart) pays nothing
      const dup = settleRace({ state: s, europe: m, result: res, level: m.level, rewards, maxLevel: MAX });
      expect(dup.duplicate).toBe(true); expect(dup.patch).toEqual({});
      // and a fresh race on a finished mission cannot pay the bonus again
      const again = settleRace({ state: s, europe: m, result: resultFor(m.track, 1), level: m.level, rewards, maxLevel: MAX });
      expect(again.europeWon).toBe(false);
      expect(canStartEuropeMission(s, m.id).ok).toBe(false);
    }
    expect(europeFinished(s.europeCompleted)).toBe(true);
    await saveApex(s); const back: any = await loadApex();
    expect(back.europeCompleted).toEqual(s.europeCompleted);
    expect(europeEndingLines('publish-evidence', 9).length).toBeGreaterThan(3);
    expect(europeEndingLines('publish-evidence', 9)[2].line).not.toBe(europeEndingLines('keep-evidence', 9)[2].line);
  });

  it('the final Europe mission needs a real win', () => {
    const f = EUROPE_MISSIONS[EUROPE_MISSIONS.length - 1];
    expect(f.requirement).toBe('win');
    expect(europeMissionComplete(f, { ticks: 900, rank: 2, track: f.track })).toBe(false);
    expect(europeMissionComplete(f, { ticks: 900, rank: 1, track: 'other' })).toBe(false);
    expect(europeMissionComplete(f, { ticks: 900, rank: 1, track: f.track })).toBe(true);
  });

  it('the ending flag survives a restart so the ending plays once', async () => {
    const s: any = await loadApex(); await saveApex({ ...s, europeEndingSeen: true });
    expect((await loadApex() as any).europeEndingSeen).toBe(true);
  });

  it('story race lifecycle: wrong track, failure, duplicates, and free races never touch story state', async () => {
    const s: any = await loadApex();
    const m = STORY_MISSIONS[0];
    const mk = (track: string, rank: number, sd?: number) => { const r = { ...resultFor(track, rank), ...(sd ? { seed: sd } : {}) }; return { r, rewards: calculateCareerRewards(r, 0) }; };
    const wrongTrack = mk(m.track === 'circuit' ? 'city' : 'circuit', 1);
    expect(settleRace({ state: s, mission: m, result: wrongTrack.r, level: 1, rewards: wrongTrack.rewards, maxLevel: MAX }).storyWon).toBe(false);
    const good = mk(m.track, 1, 9001);
    const first = settleRace({ state: s, mission: m, result: good.r, level: 1, rewards: good.rewards, maxLevel: MAX });
    expect(first.storyWon).toBe(true);
    const s2: any = { ...s, ...first.patch };
    expect(settleRace({ state: s2, mission: m, result: good.r, level: 1, rewards: good.rewards, maxLevel: MAX }).duplicate).toBe(true);
    const again = mk(m.track, 1);
    expect(settleRace({ state: s2, mission: m, result: again.r, level: 1, rewards: again.rewards, maxLevel: MAX }).storyWon).toBe(false);
    const fr = mk('circuit', 1);
    const out = settleRace({ state: s2, result: fr.r, level: 1, rewards: fr.rewards, maxLevel: MAX });
    expect(out.patch.storyFuel).toBe(s2.storyFuel); expect(out.patch.storyCondition).toBe(s2.storyCondition); expect(out.patch.storyCompleted).toEqual(s2.storyCompleted);
  });

  it('job settlement is exactly-once even if the app restarts and replays it', async () => {
    let s: any = await loadApex();
    const ids = STORY_MISSIONS.filter((m) => jobFor(m.id)).slice(0, 1).map((m) => m.id);
    const m = STORY_MISSIONS.find((x) => x.id === ids[0])!; const job = jobFor(m.id)!;
    const o: JobOutcome = { success: true, reason: '', hits: 0, seconds: 20, timeBonus: 30, clues: [] };
    const p1 = applyJobResult(s, m, job, o, MAX); const { coinsGained, ...save1 } = p1; s = { ...s, ...save1 };
    expect(coinsGained).toBeGreaterThan(0);
    await saveApex(s); const reloaded: any = await loadApex();
    const p2 = applyJobResult(reloaded, m, job, o, MAX);
    expect(p2.coinsGained).toBe(0); expect(p2.coins).toBe(reloaded.coins);
  });

  it('the Johannesburg finale is no longer two identical championship races', () => {
    const a = STORY_MISSIONS.find((m) => m.id === 'africa-grand-championship')!, b = STORY_MISSIONS.find((m) => m.id === 'johannesburg-championship')!;
    expect(a.objective).not.toBe(b.objective); expect(a.requirement).not.toBe(b.requirement);
    expect(STORY_TALK['africa-grand-championship'].after.line).not.toMatch(/Europe just called/);
    expect(STORY_TALK['johannesburg-road-home'].after.line).toMatch(/Europe/);
    const order = STORY_MISSIONS.map((m) => m.id);
    expect(order.indexOf('africa-grand-championship')).toBeLessThan(order.indexOf('johannesburg-championship'));
    expect(order[order.length - 1]).toBe('johannesburg-road-home');
  });

  it('regional drives: reward once, only real regions count, bests improve, saves round-trip', async () => {
    let s: any = { ...(await loadApex()), coins: 0 };
    expect(settleRegion(s, 'atlantis', 500, 30, 5)).toBeNull();
    for (const id of AFRICA_CAMPAIGN_REGION_IDS) {
      const first = settleRegion(s, id, 500, 60, 3)!; expect(first.firstTime).toBe(true); s = { ...s, ...first.patch };
      const before = s.coins;
      const slower = settleRegion(s, id, 500, 90, 2)!; expect(slower.patch).toEqual({});                       // nothing to save
      const faster = settleRegion(s, id, 500, 50, 3)!; s = { ...s, ...faster.patch };
      expect(s.coins).toBe(before);                                                                         // no second reward
      expect(s.africaBestTimes[id]).toBe(50);
      const better = settleRegion(s, id, 500, 55, 5)!; s = { ...s, ...better.patch }; expect(s.africaChampionshipPoints[id]).toBe(5);
      expect(s.africaBestTimes[id]).toBe(50);                                                               // a slower run does not overwrite the best
    }
    expect(s.coins).toBe(500 * 10); expect(s.africaRegionsCompleted).toHaveLength(10);
    await saveApex(s); const back: any = await loadApex();
    expect(back.africaRegionsCompleted).toEqual(s.africaRegionsCompleted); expect(back.africaBestTimes).toEqual(s.africaBestTimes);
    // all ten regions are part of the Africa gate
    const all = STORY_MISSIONS.map((m) => m.id);
    expect(europeUnlocked(all, back.africaRegionsCompleted)).toBe(true);
    expect(europeUnlocked(all, back.africaRegionsCompleted.slice(0, 9))).toBe(false);
  });
});
