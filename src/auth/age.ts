/** Youngest age that can have an account (the terms of service). */
export const MIN_ACCOUNT_AGE = 13;
/** Youngest age that can broadcast live. */
export const MIN_GO_LIVE_AGE = 18;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a YYYY-MM-DD date, or null if it isn't a real calendar date. */
export function parseBirthDate(
  value: unknown,
): { y: number; m: number; d: number } | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

/** Whole years old on `today` (UTC), for a YYYY-MM-DD birth date. */
export function ageOn(birthDate: string, today: Date = new Date()): number {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return NaN;
  const { y, m, d } = parsed;
  let age = today.getUTCFullYear() - y;
  const month = today.getUTCMonth() + 1;
  if (month < m || (month === m && today.getUTCDate() < d)) age -= 1;
  return age;
}
