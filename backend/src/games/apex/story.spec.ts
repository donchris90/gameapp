import { STORY_MISSIONS, storyMissionComplete, africaCampaignDone, AFRICA_CAMPAIGN_REGION_IDS } from '../../../../mobile/src/apex/story';
import { applyNeed, STORY_NEEDS, needsFor } from '../../../../mobile/src/apex/storyExtras';

const M = (id: string) => STORY_MISSIONS.find((m) => m.id === id)!;
const res = (o: Partial<{ track: string; rank: number; hits: number; pedHits: number; ticks: number }> = {}) =>
  ({ track: 'coast', laps: 1, ticks: 900, rank: 1, hits: 0, pedHits: 0, bestLap: 30, ...o });

describe('story mission completion', () => {
  it('has unique ids and 56 missions', () => {
    expect(new Set(STORY_MISSIONS.map((m) => m.id)).size).toBe(STORY_MISSIONS.length);
    expect(STORY_MISSIONS).toHaveLength(56);
  });
  it('finish needs the mission track and a real result', () => {
    const m = M('one-more-start');
    expect(storyMissionComplete(m, res({ track: m.track, rank: 6 }), 1)).toBe(true);
    expect(storyMissionComplete(m, res({ track: 'dunes' }), 1)).toBe(false);
    expect(storyMissionComplete(m, res({ track: m.track, ticks: 0 }), 1)).toBe(false);
  });
  it('podium and win are rank and track bound', () => {
    const p = STORY_MISSIONS.find((m) => m.requirement === 'podium')!;
    expect(storyMissionComplete(p, res({ track: p.track, rank: 3 }), 5)).toBe(true);
    expect(storyMissionComplete(p, res({ track: p.track, rank: 4 }), 5)).toBe(false);
    expect(storyMissionComplete(p, res({ track: 'other', rank: 1 }), 5)).toBe(false);
    const w = STORY_MISSIONS.find((m) => m.requirement === 'win')!;
    expect(storyMissionComplete(w, res({ track: w.track, rank: 2 }), 5)).toBe(false);
    expect(storyMissionComplete(w, res({ track: w.track, rank: 1 }), 5)).toBe(true);
  });
  it('three-races needs the track and three races', () => {
    const t = STORY_MISSIONS.find((m) => m.requirement === 'three-races')!;
    expect(storyMissionComplete(t, res({ track: t.track }), 2)).toBe(false);
    expect(storyMissionComplete(t, res({ track: 'other' }), 3)).toBe(false);
    expect(storyMissionComplete(t, res({ track: t.track }), 3)).toBe(true);
  });
  it('clean-finish and low-damage rules', () => {
    const c = STORY_MISSIONS.find((m) => m.specialRule === 'clean-finish')!;
    expect(storyMissionComplete(c, res({ track: c.track, hits: 1 }), 5)).toBe(false);
    expect(storyMissionComplete(c, res({ track: c.track }), 5)).toBe(true);
    const l = STORY_MISSIONS.find((m) => m.specialRule === 'low-damage' && m.id !== 'atlas-cut-line')!;
    expect(storyMissionComplete(l, res({ track: l.track, hits: 2 }), 5)).toBe(true);
    expect(storyMissionComplete(l, res({ track: l.track, hits: 3 }), 5)).toBe(false);
    expect(storyMissionComplete(l, res({ track: l.track, pedHits: 1 }), 5)).toBe(false);
  });
});

describe('story needs purchase', () => {
  const need = Object.values(STORY_NEEDS).flat().find((n) => n.upgrade)!;
  const base = { coins: 100000, activeCar: 'cts', upgrades: {} as Record<string, number[]>, storyNeedsDone: [] as string[] };
  it('charges exactly once', () => {
    const a = applyNeed(base, need.id);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.patch.coins).toBe(100000 - need.price);
    const again = applyNeed({ ...base, ...a.patch }, need.id);
    expect(again).toEqual({ ok: false, reason: 'done' });
  });
  it('does not charge for an upgrade already owned', () => {
    const lv = [0, 0, 0, 0]; lv[need.upgrade!.kind] = need.upgrade!.level;
    expect(applyNeed({ ...base, upgrades: { cts: lv } }, need.id)).toEqual({ ok: false, reason: 'done' });
  });
  it('refuses with insufficient funds and unknown ids', () => {
    expect(applyNeed({ ...base, coins: need.price - 1 }, need.id)).toEqual({ ok: false, reason: 'funds', short: 1 });
    expect(applyNeed(base, 'nope')).toEqual({ ok: false, reason: 'unknown' });
  });
  it('every need belongs to a real mission', () => {
    for (const id of Object.keys(STORY_NEEDS)) { expect(STORY_MISSIONS.some((m) => m.id === id)).toBe(true); expect(needsFor(id).length).toBeGreaterThan(0); }
  });
});

describe('africa completion gate', () => {
  const africa = STORY_MISSIONS.filter((m) => m.chapter === 'africa').map((m) => m.id);
  it('needs every mission and every region', () => {
    expect(africaCampaignDone(africa, [...AFRICA_CAMPAIGN_REGION_IDS])).toBe(true);
    expect(africaCampaignDone(africa.slice(1), [...AFRICA_CAMPAIGN_REGION_IDS])).toBe(false);
    expect(africaCampaignDone(africa, AFRICA_CAMPAIGN_REGION_IDS.slice(1))).toBe(false);
  });
});
