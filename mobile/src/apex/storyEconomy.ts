import { JobDef, JobOutcome, jobCoins } from './jobs';

/** Fuel and wear one story outing costs. Used by story races and story jobs alike. */
export function storyUsage(approach: string, trust: number, hits: number, cooling = false) {
  const crewSupport = trust >= 75 ? -2 : trust < 30 ? 3 : 0;
  const fuel = Math.max(6, (approach === 'speed' ? 18 : approach === 'reliability' ? 10 : approach === 'grip' ? 13 : 14) + crewSupport);
  const wear = Math.max(1, Math.min(25, 5 + Math.max(0, hits) * 3 + (approach === 'speed' ? 3 : 0) - (approach === 'reliability' ? 4 : 0) + (trust < 30 ? 2 : trust >= 75 ? -1 : 0) - (cooling ? 2 : 0)));
  return { fuel, wear };
}

export interface JobSave {
  coins: number; careerXP?: number; unlocked: number; storyCompleted: string[];
  storyFuel?: number; storyCondition?: number; storyTrust?: number; storyEvidence?: string[]; storyApproach?: string; storyNeedsDone?: string[];
}
/**
 * What a finished job changes. Pays once per mission: a mission already completed pays nothing and records nothing.
 * Fuel and condition are spent win or lose (the drive happened); clues, coins, XP and the unlock only on success.
 */
export function applyJobResult(s: JobSave, mission: { id: string; level: number }, def: JobDef, o: JobOutcome, maxLevel: number): Partial<JobSave> & { coins: number; coinsGained: number } {
  const already = s.storyCompleted.includes(mission.id);
  if (already) return { coins: s.coins, coinsGained: 0 };
  const trust = s.storyTrust ?? 50;
  const use = storyUsage(s.storyApproach ?? 'balanced', trust, o.hits, (s.storyNeedsDone ?? []).includes('n-cooling'));
  const gained = jobCoins(def, o);
  const patch: Partial<JobSave> & { coins: number; coinsGained: number } = {
    coins: s.coins + gained, coinsGained: gained,
    storyFuel: Math.max(0, (s.storyFuel ?? 100) - use.fuel),
    storyCondition: Math.max(0, (s.storyCondition ?? 100) - use.wear),
    storyTrust: Math.max(0, Math.min(100, trust + (o.success ? (o.hits === 0 ? 3 : 1) : -2))),
  };
  if (o.success) {
    patch.storyCompleted = [...s.storyCompleted, mission.id];
    patch.careerXP = (s.careerXP ?? 0) + 60;
    patch.unlocked = Math.max(s.unlocked, Math.min(maxLevel, mission.level + 1));
    patch.storyEvidence = Array.from(new Set([...(s.storyEvidence ?? []), ...o.clues]));
  }
  return patch;
}

export const FUEL_PRICE = 100, FUEL_STEP = 25, REPAIR_PRICE = 150, REPAIR_STEP = 25;
/** Workshop purchases. Return null (nothing changes) when the tank/car is already full or the player cannot pay. */
export function buyFuel(s: { coins: number; storyFuel?: number }) {
  const fuel = s.storyFuel ?? 100;
  if (fuel >= 100 || s.coins < FUEL_PRICE) return null;
  return { coins: s.coins - FUEL_PRICE, storyFuel: Math.min(100, fuel + FUEL_STEP) };
}
export function buyRepair(s: { coins: number; storyCondition?: number }) {
  const c = s.storyCondition ?? 100;
  if (c >= 100 || s.coins < REPAIR_PRICE) return null;
  return { coins: s.coins - REPAIR_PRICE, storyCondition: Math.min(100, c + REPAIR_STEP) };
}
