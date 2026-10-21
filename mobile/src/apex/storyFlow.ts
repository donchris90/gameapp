import { africaCampaignDone, AFRICA_CAMPAIGN_REGION_IDS, currentStoryMission, STORY_MISSIONS, chapterProgress } from './story';
import { currentEuropeMission, EUROPE_MISSIONS } from './europe';

/**
 * THE AFRICA → EUROPE RULE
 * Europe unlocks only when every Africa story mission (the 49 missions of the Africa chapter, ending with The Road Home)
 * is complete AND all ten regional drives are saved. Both lists are checked by id, never by count.
 */
export const europeUnlocked = (completed: string[], regions: string[]) => africaCampaignDone(completed, regions);

export type StartCheck = { ok: true } | { ok: false; reason: string };
const no = (reason: string): StartCheck => ({ ok: false, reason });

export interface FlowState { storyCompleted: string[]; unlocked: number; storyFuel?: number; storyCondition?: number; africaRegionsCompleted?: string[]; europeCompleted?: string[] }

/** Story missions are played strictly in order; the Africa chapter opens only after all seven Lagos missions. */
export function canStartStoryMission(s: FlowState, missionId: string): StartCheck {
  const m = STORY_MISSIONS.find((x) => x.id === missionId);
  if (!m) return no('Unknown mission.');
  if (s.storyCompleted.includes(m.id)) return no('Mission already complete.');
  if (m.chapter === 'africa' && !chapterProgress(s.storyCompleted, 'lagos').complete) return no('Finish all seven Lagos missions first.');
  if (currentStoryMission(s.storyCompleted)?.id !== m.id) return no('Complete the previous mission first.');
  if (m.level > s.unlocked) return no(m.lockedHint ?? `Reach career level ${m.level} first.`);
  if ((s.storyFuel ?? 100) < 15) return no('NOT ENOUGH FUEL · Refuel in the story workshop before starting this mission.');
  if ((s.storyCondition ?? 100) < 15) return no('CAR TOO DAMAGED · Repair the car in the story workshop before starting this mission.');
  return { ok: true };
}

export function canStartEuropeMission(s: FlowState, missionId: string): StartCheck {
  if (!europeUnlocked(s.storyCompleted, s.africaRegionsCompleted ?? [])) return no('Complete every Africa story mission and all ten regional drives first.');
  const m = EUROPE_MISSIONS.find((x) => x.id === missionId);
  if (!m) return no('Unknown mission.');
  const done = s.europeCompleted ?? [];
  if (done.includes(m.id)) return no('Mission already complete.');
  if (currentEuropeMission(done)?.id !== m.id) return no('Complete the previous Europe mission first.');
  return { ok: true };
}

export const europeFinished = (europeCompleted: string[]) => EUROPE_MISSIONS.every((m) => europeCompleted.includes(m.id));

/** The closing scene. It reads the player's own earlier choice and how much proof they gathered. */
export function europeEndingLines(choice: string | undefined, evidenceCount: number) {
  const strong = evidenceCount >= 5;
  const verdict = choice === 'publish-evidence'
    ? (strong ? 'The files went public with a strong case behind them. Vanguard’s results were rewritten back to the truth, one race at a time.' : 'The files went public, though some proof was still missing. Vanguard will fight it, but the story is out.')
    : choice === 'keep-evidence' ? 'You kept the evidence safe instead of burning it in public. Some proof waits for the next investigation, and Vanguard knows it.'
    : 'The evidence is safe and the truth is told, in the way the crew chose together.';
  return [
    { who: 'Mara Okafor', line: 'Nürburgring. The last flag. From a coughing old engine in Lagos to this.' },
    { who: 'Tomi', line: 'Dad hid the proof inside the car. That was why they wanted it gone.' },
    { who: 'Amara Diallo', line: verdict },
    { who: 'Darius Cole', line: 'I owed your father the truth. Now we all have it.' },
    { who: 'Tomi', line: 'No limits. Not on the road, and not on what we can finish.' },
  ];
}

export interface RegionState { africaRegionsCompleted?: string[]; africaBestTimes?: Record<string, number>; africaChampionshipPoints?: Record<string, number>; coins: number }
/**
 * A finished regional drive. The coin reward is paid the first time a region is completed and never again;
 * later runs may only improve the saved best time or cup points. Unknown region ids are ignored.
 */
export function settleRegion(s: RegionState, regionId: string, reward: number, elapsedSeconds: number, points: number): { patch: Partial<RegionState>; firstTime: boolean; newBest: boolean } | null {
  if (!AFRICA_CAMPAIGN_REGION_IDS.includes(regionId as (typeof AFRICA_CAMPAIGN_REGION_IDS)[number])) return null;
  const current = s.africaRegionsCompleted ?? [];
  const firstTime = !current.includes(regionId);
  const previousBest = s.africaBestTimes?.[regionId] ?? Infinity;
  const newBest = elapsedSeconds > 0 && elapsedSeconds < previousBest;
  const betterPoints = points > (s.africaChampionshipPoints?.[regionId] ?? 0);
  if (!firstTime && !newBest && !betterPoints) return { patch: {}, firstTime, newBest };
  return {
    firstTime, newBest,
    patch: {
      africaRegionsCompleted: firstTime ? [...current, regionId] : current,
      africaBestTimes: newBest ? { ...(s.africaBestTimes ?? {}), [regionId]: elapsedSeconds } : (s.africaBestTimes ?? {}),
      africaChampionshipPoints: betterPoints ? { ...(s.africaChampionshipPoints ?? {}), [regionId]: points } : (s.africaChampionshipPoints ?? {}),
      coins: s.coins + (firstTime ? Math.max(0, reward) : 0),
    },
  };
}
