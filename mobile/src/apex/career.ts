export interface CareerRaceResult { track: string; laps: number; ticks: number; rank: number; hits: number; pedHits: number; bestLap: number }

export interface CareerRewardBreakdown {
  base: number;
  placement: number;
  clean: number;
  record: number;
  xp: number;
  isRecord: boolean;
  recordKey: string;
  bestLap: number;
}

const placementReward = (rank: number) => [0, 300, 200, 120, 80, 60, 40][rank] ?? 30;

/** Pure reward calculation so the career economy can be regression-tested without rendering React Native. */
export function calculateCareerRewards(result: CareerRaceResult, previousBest = 0): CareerRewardBreakdown {
  const base = result.ticks > 0 ? 120 : 40;
  const placement = placementReward(Math.max(1, Math.floor(result.rank || 1)));
  const clean = result.hits === 0 && result.pedHits === 0 ? 75 : 0;
  const recordKey = `${result.track}:${result.laps}`;
  const isRecord = result.bestLap > 0 && (!previousBest || result.bestLap < previousBest);
  const record = isRecord ? 50 : 0;
  const xp = 80 + (result.rank === 1 ? 120 : result.rank <= 3 ? 80 : 30) + (clean ? 25 : 0) + (isRecord ? 30 : 0);
  return { base, placement, clean, record, xp, isRecord, recordKey, bestLap: isRecord ? result.bestLap : previousBest };
}

export function driverRankForXP(xp: number) { return Math.floor(Math.max(0, Number.isFinite(xp) ? xp : 0) / 500) + 1; }
export function xpIntoRank(xp: number) { return Math.max(0, Number.isFinite(xp) ? xp : 0) % 500; }
