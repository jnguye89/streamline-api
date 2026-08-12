const DEFAULT_UI_ORIGIN = 'http://localhost:4200';

export function getCorsOrigins(): string[] {
  const value =
    process.env.CORS_ORIGIN || process.env.UI_ORIGIN || DEFAULT_UI_ORIGIN;

  return value
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}
