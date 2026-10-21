import { JOBS } from '../../../../mobile/src/apex/jobs';
import { STORY_MISSIONS } from '../../../../mobile/src/apex/story';
import { CLUE_TEXT, describeEvidence, evidenceList } from '../../../../mobile/src/apex/evidence';
import { REGION_LOOKS, regionOf } from '../../../../mobile/src/apex/regionLook';

describe('evidence and regions', () => {
  it('every clue a job can award has a write-up', () => {
    JOBS.flatMap((j) => j.points.map((p) => p.clue)).filter(Boolean).forEach((c) => expect(CLUE_TEXT[c as string]).toBeDefined());
  });
  it('mission evidence is described from the mission, unknown ids do not crash, duplicates collapse', () => {
    const m = STORY_MISSIONS[8];
    expect(describeEvidence(m.id).title).toBe(m.title);
    expect(describeEvidence('nope').title).toBe('nope');
    expect(evidenceList(['clue:namib-wreck', 'clue:namib-wreck'])).toHaveLength(1);
  });
  it('every job mission resolves to a region look, and regions differ', () => {
    JOBS.forEach((j) => expect(regionOf(j.missionId)).toBeDefined());
    expect(regionOf('cairo-project-files').name).toBe('CAIRO');
    expect(regionOf('namib-ghost-convoy').name).toBe('NAMIB COAST');
    expect(regionOf('cape-garage-raid').name).toBe('CAPE TOWN');
    expect(regionOf('the-stolen-blueprint').name).toBe('LAGOS');
    expect(new Set(Object.values(REGION_LOOKS).map((r) => r.ground)).size).toBeGreaterThan(8);
  });
});
