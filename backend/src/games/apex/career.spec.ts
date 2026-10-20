import { calculateCareerRewards, driverRankForXP, xpIntoRank } from '../../../../mobile/src/apex/career';

describe('Apex career economy', () => {
  const race = { track: 'circuit', laps: 3, ticks: 3000, rank: 1, hits: 0, pedHits: 0, bestLap: 40 };

  it('adds finish, win, clean-race and first-record rewards exactly as itemized', () => {
    expect(calculateCareerRewards(race, 0)).toEqual({
      base: 120, placement: 300, clean: 75, record: 50, xp: 255,
      isRecord: true, recordKey: 'circuit:3', bestLap: 40,
    });
  });

  it('does not grant a track-record reward for a slower or equal lap', () => {
    expect(calculateCareerRewards({ ...race, bestLap: 41 }, 40).record).toBe(0);
    expect(calculateCareerRewards({ ...race, bestLap: 40 }, 40).isRecord).toBe(false);
  });

  it('removes clean bonus after a collision and gives lower finish XP', () => {
    const result = calculateCareerRewards({ ...race, rank: 5, hits: 1 }, 35);
    expect(result.clean).toBe(0);
    expect(result.record).toBe(0);
    expect(result.xp).toBe(110);
  });

  it('keeps driver ranks stable at 500 XP boundaries', () => {
    expect(driverRankForXP(0)).toBe(1);
    expect(driverRankForXP(499)).toBe(1);
    expect(driverRankForXP(500)).toBe(2);
    expect(xpIntoRank(750)).toBe(250);
  });
});
