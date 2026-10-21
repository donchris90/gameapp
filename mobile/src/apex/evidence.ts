import { STORY_MISSIONS } from './story';
import { regionOf } from './regionLook';

export interface EvidenceItem { id: string; title: string; text: string; region: string; kind: 'clue' | 'record' }

/** Evidence from jobs (clue:*) has its own write-up; the rest come from the mission that revealed them. */
export const CLUE_TEXT: Record<string, { title: string; text: string }> = {
  'clue:namib-marker': { title: 'The roadside marker', text: 'A hand-painted marker with a Project Apex test number. Someone wanted this place remembered.' },
  'clue:namib-wreck': { title: 'The wreck', text: 'The same chassis family as Tomi’s father’s car, stripped of its plates before it was left here.' },
  'clue:namib-trail': { title: 'Skid trail', text: 'Two cars ran side by side, then one left the road. The tyre marks show it was pushed.' },
  'clue:namib-module': { title: 'Data module', text: 'A sealed recorder with a telemetry log from the night of the old test.' },
  'clue:atlas-unit': { title: 'Storage unit', text: 'Darius rented this unit under a false name the week Tomi’s father vanished.' },
  'clue:atlas-garage': { title: 'The old garage', text: 'Service books for the father’s car, with entries in Darius’s handwriting.' },
  'clue:atlas-yard': { title: 'Scrap yard', text: 'A crushed car carrying the same serial mark as Tomi’s own.' },
  'clue:atlas-plate': { title: 'Serial plate', text: 'The plate matches a Project Apex build record, not a road car.' },
  'clue:cairo-files': { title: 'Project Apex files', text: 'Copies of the race-manipulation schedule Vanguard ran through telemetry.' },
  'clue:cape-evidence': { title: 'Recovered evidence', text: 'The evidence box Vanguard tried to steal, now back in the crew’s hands.' },
  'clue:johannesburg-logs': { title: 'Control-room logs', text: 'The logs that show Sloane changing race results, race by race.' },
};

export function describeEvidence(id: string): EvidenceItem {
  const c = CLUE_TEXT[id];
  if (c) { const key = id.slice(5); return { id, title: c.title, text: c.text, region: regionOf(key).name, kind: 'clue' }; }
  const m = STORY_MISSIONS.find((x) => x.id === id);
  if (m) return { id, title: m.title, text: m.briefing, region: regionOf(m.id).name, kind: 'record' };
  return { id, title: id, text: '', region: '', kind: 'record' };
}
export const evidenceList = (ids: string[]) => Array.from(new Set(ids)).map(describeEvidence);
