import { CareerRaceResult, CareerRewardBreakdown } from './career';
import { StoryMission, storyMissionComplete } from './story';
import { EuropeMission, europeMissionComplete } from './europe';
import { storyUsage } from './storyEconomy';

/** The part of the save that settling a race can change. */
export interface SettleState {
  coins: number; careerXP?: number; completedRaces: number; podiums?: number; cleanRaces?: number;
  bestLaps?: Record<string, number>; processedRaceKeys?: string[]; unlocked: number;
  storyCompleted: string[]; storyFuel?: number; storyCondition?: number; storyTrust?: number; storyEvidence?: string[];
  storyApproach?: string; storyNeedsDone?: string[]; europeCompleted?: string[];
}
export interface SettleInput {
  state: SettleState; mission?: StoryMission; europe?: EuropeMission;
  result: CareerRaceResult & { seed: number }; level: number; rewards: CareerRewardBreakdown; maxLevel: number;
}
export interface SettleOutput { duplicate: boolean; patch: Partial<SettleState>; storyWon: boolean; europeWon: boolean; finalEurope: boolean; evidenceId: string | null }

const EVIDENCE_WORDS = /clue|notebook|signal|evidence|recording|witness|project|files|black.box|telemetry|broker|father|control.room/i;

/**
 * What one finished race changes. Pure, so the whole lifecycle can be tested:
 *  - the same race (track + seed) never settles twice
 *  - a story or Europe mission completes only on its own track and objective, and only once
 *  - fuel and condition are spent on Africa story missions only (Europe has no workshop)
 *  - the Europe bonus is paid in the same save as its completion, so it cannot be paid twice
 */
export function settleRace(i: SettleInput): SettleOutput {
  const s = i.state, r = i.result;
  const raceKey = `${r.track}:${r.seed}`;
  const none: SettleOutput = { duplicate: true, patch: {}, storyWon: false, europeWon: false, finalEurope: false, evidenceId: null };
  if ((s.processedRaceKeys ?? []).includes(raceKey)) return none;
  const reward = i.rewards.base + i.rewards.placement + i.rewards.clean + i.rewards.record;
  const storyWon = Boolean(i.mission && !s.storyCompleted.includes(i.mission.id) && storyMissionComplete(i.mission, r, s.completedRaces + 1));
  const europeDone = s.europeCompleted ?? [];
  const europeWon = Boolean(i.europe && !europeDone.includes(i.europe.id) && europeMissionComplete(i.europe, r));
  const trust = s.storyTrust ?? 50;
  const usage = storyUsage(s.storyApproach ?? 'balanced', trust, r.hits ?? 0, (s.storyNeedsDone ?? []).includes('n-cooling'));
  const evidenceId = i.mission && storyWon && EVIDENCE_WORDS.test(`${i.mission.title} ${i.mission.briefing}`) ? i.mission.id : null;
  const careerStep = r.rank <= 3 && i.level >= s.unlocked && i.level < i.maxLevel ? i.level + 1 : s.unlocked;
  const bestLaps = { ...(s.bestLaps ?? {}) };
  if (i.rewards.isRecord) bestLaps[i.rewards.recordKey] = i.rewards.bestLap;
  const inStory = Boolean(i.mission || i.europe);
  return {
    duplicate: false, storyWon, europeWon, evidenceId,
    finalEurope: europeWon && europeDone.length + 1 >= 12,
    patch: {
      coins: s.coins + reward + (europeWon ? i.europe!.reward : 0),
      careerXP: (s.careerXP ?? 0) + i.rewards.xp,
      completedRaces: s.completedRaces + 1,
      podiums: (s.podiums ?? 0) + (r.rank <= 3 ? 1 : 0),
      cleanRaces: (s.cleanRaces ?? 0) + (i.rewards.clean ? 1 : 0),
      bestLaps,
      processedRaceKeys: [...(s.processedRaceKeys ?? []), raceKey].slice(-250),
      unlocked: storyWon ? Math.max(careerStep, Math.min(i.maxLevel, i.mission!.level + 1)) : careerStep,
      storyCompleted: storyWon ? [...s.storyCompleted, i.mission!.id] : s.storyCompleted,
      storyFuel: i.mission ? Math.max(0, (s.storyFuel ?? 100) - usage.fuel) : (s.storyFuel ?? 100),
      storyCondition: i.mission ? Math.max(0, (s.storyCondition ?? 100) - usage.wear) : (s.storyCondition ?? 100),
      storyTrust: inStory ? Math.max(0, Math.min(100, trust + (r.rank === 1 ? 3 : r.rank <= 3 ? 1 : -2))) : trust,
      storyEvidence: evidenceId ? Array.from(new Set([...(s.storyEvidence ?? []), evidenceId])) : (s.storyEvidence ?? []),
      europeCompleted: europeWon ? [...europeDone, i.europe!.id] : europeDone,
    },
  };
}
