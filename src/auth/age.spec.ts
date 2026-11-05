import { ageOn, parseBirthDate } from './age';

describe('age', () => {
  const today = new Date(Date.UTC(2026, 10, 3)); // 3 Nov 2026

  it('counts whole years, turning over on the birthday', () => {
    expect(ageOn('2008-11-03', today)).toBe(18);
    expect(ageOn('2008-11-04', today)).toBe(17);
    expect(ageOn('2013-11-02', today)).toBe(13);
    expect(ageOn('2013-12-01', today)).toBe(12);
  });

  it('handles leap-day birthdays in other years', () => {
    expect(ageOn('2008-02-29', new Date(Date.UTC(2026, 1, 28)))).toBe(17);
    expect(ageOn('2008-02-29', new Date(Date.UTC(2026, 2, 1)))).toBe(18);
  });

  it('only accepts real YYYY-MM-DD dates', () => {
    expect(parseBirthDate('2000-02-29')).toEqual({ y: 2000, m: 2, d: 29 });
    expect(parseBirthDate('2001-02-29')).toBeNull();
    expect(parseBirthDate('2001-13-01')).toBeNull();
    expect(parseBirthDate('01/02/2001')).toBeNull();
    expect(parseBirthDate(20010201)).toBeNull();
  });
});
