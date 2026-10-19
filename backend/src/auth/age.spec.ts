import { ageInYears, parseBirthDate } from './age';

describe('parseBirthDate', () => {
  it('accepts real dates', () => {
    expect(parseBirthDate('2000-02-29')?.toISOString()).toBe('2000-02-29T00:00:00.000Z');
  });
  it.each(['2001-02-29', '2000-13-01', '2000-00-10', '2000-1-1', '20000101', 'abc', ''])('rejects %s', (s) => {
    expect(parseBirthDate(s)).toBeNull();
  });
});

describe('ageInYears', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  it('is 18 on the birthday itself', () => {
    expect(ageInYears(new Date('2008-10-19T00:00:00Z'), now)).toBe(18);
  });
  it('is still 17 the day before the 18th birthday', () => {
    expect(ageInYears(new Date('2008-10-20T00:00:00Z'), now)).toBe(17);
  });
  it('handles earlier months and later months', () => {
    expect(ageInYears(new Date('1990-01-01T00:00:00Z'), now)).toBe(36);
    expect(ageInYears(new Date('1990-12-31T00:00:00Z'), now)).toBe(35);
  });
});
