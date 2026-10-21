const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({ getItemAsync: async (k: string) => store[k] ?? null, setItemAsync: async (k: string, v: string) => { store[k] = v; } }), { virtual: true });
import { loadApex, saveApex } from '../../../../mobile/src/apex/storage';
import { STORY_MISSIONS, STORY_TALK } from '../../../../mobile/src/apex/story';
import { partsOf, applyNeed, STORY_NEEDS } from '../../../../mobile/src/apex/storyExtras';
import { storyUsage } from '../../../../mobile/src/apex/storyEconomy';

const raw = () => Object.keys(store).find((k) => !k.includes('style')) as string;

describe('save, restart and resume', () => {
  beforeEach(() => { Object.keys(store).forEach((k) => delete store[k]); });
  it('a fresh install gets safe defaults', async () => {
    const s = await loadApex();
    expect(s.storyCompleted).toEqual([]); expect(s.storyFuel).toBe(100); expect(s.storyTrust).toBe(50); expect(s.storyApproach).toBe('balanced');
  });
  it('progress survives a restart', async () => {
    const s = await loadApex();
    await saveApex({ ...s, coins: 777, storyCompleted: ['one-more-start', 'empty-tank'], storyNeedsDone: ['n-engine-1'], storyEvidence: ['clue:namib-wreck'], storyChoices: { 'johannesburg-road-home': 'publish-evidence' }, storyFuel: 61, storyCondition: 44, storyTrust: 72, storyApproach: 'grip', africaRegionsCompleted: ['accra'] });
    const back = await loadApex();
    expect(back).toMatchObject({ coins: 777, storyCompleted: ['one-more-start', 'empty-tank'], storyNeedsDone: ['n-engine-1'], storyEvidence: ['clue:namib-wreck'], storyFuel: 61, storyCondition: 44, storyTrust: 72, storyApproach: 'grip', africaRegionsCompleted: ['accra'] });
    expect(back.storyChoices['johannesburg-road-home']).toBe('publish-evidence');
  });
  it('damaged or hand-edited saves cannot unlock or break anything', async () => {
    const s = await loadApex();
    await saveApex({ ...s });
    store[raw()] = JSON.stringify({ coins: -50, storyCompleted: ['one-more-start', 'one-more-start', 'fake-mission', 7], storyFuel: 900, storyCondition: 'x', storyTrust: NaN, storyEvidence: 'no', storyChoices: [1], storyApproach: 'cheat', storyNeedsDone: [1, 'n-licence'] });
    const b = await loadApex();
    expect(b.coins).toBe(0); expect(b.storyCompleted).toEqual(['one-more-start']); expect(b.storyFuel).toBe(100); expect(b.storyCondition).toBe(100); expect(b.storyTrust).toBe(50);
    expect(b.storyEvidence).toEqual([]); expect(b.storyChoices).toEqual({}); expect(b.storyApproach).toBe('balanced'); expect(b.storyNeedsDone).toEqual(['n-licence']);
  });
  it('an old save with no story fields still loads (migration)', async () => {
    const k = (await (async () => { const s = await loadApex(); await saveApex(s); return raw(); })());
    store[k] = JSON.stringify({ coins: 500, unlocked: 4, storyCompleted: ['one-more-start'] });
    const b = await loadApex(); expect(b.coins).toBe(500); expect(b.unlocked).toBe(4); expect(b.storyFuel).toBe(100);
  });
  it('corrupt JSON falls back to defaults instead of crashing', async () => {
    const s = await loadApex(); await saveApex(s); store[raw()] = '{not json'; expect((await loadApex()).coins).toBeGreaterThanOrEqual(0);
  });
});

describe('story parts, dialogue and fees', () => {
  it('cooling, brakes and suspension are real purchases that charge once', () => {
    const base = { coins: 5000, activeCar: 'cts', upgrades: {}, storyNeedsDone: [] as string[] };
    for (const id of ['n-cooling', 'n-brakes', 'n-suspension']) {
      const r = applyNeed(base, id); expect(r.ok).toBe(true);
      if (r.ok) { expect(partsOf(r.patch.storyNeedsDone)[id.slice(2) as 'cooling']).toBe(true); expect(applyNeed({ ...base, ...r.patch }, id)).toEqual({ ok: false, reason: 'done' }); }
    }
    expect(Object.values(STORY_NEEDS).flat().some((n) => n.id === 'n-cooling')).toBe(true);
  });
  it('cooling lowers wear', () => { expect(storyUsage('balanced', 50, 0, true).wear).toBeLessThan(storyUsage('balanced', 50, 0, false).wear); });
  it('every mission has specific dialogue, not the generic fallback', () => {
    for (const m of STORY_MISSIONS) { const t = STORY_TALK[m.id]; expect(t.before.length).toBeGreaterThanOrEqual(1); expect(t.before[0].line).not.toBe(m.briefing); expect(t.after.line).not.toMatch(/is behind us\. The clue is useful/); }
  });
});
