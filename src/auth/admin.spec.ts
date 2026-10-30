import { isAdmin } from './admin';

describe('isAdmin', () => {
  const env = process.env.ADMIN_USER_IDS;
  afterEach(() => {
    process.env.ADMIN_USER_IDS = env;
  });

  it('matches ids listed in ADMIN_USER_IDS', () => {
    process.env.ADMIN_USER_IDS = 'auth0|a, auth0|b';
    expect(isAdmin('auth0|a')).toBe(true);
    expect(isAdmin('auth0|b')).toBe(true);
    expect(isAdmin('auth0|c')).toBe(false);
  });

  it('allows nobody when unset', () => {
    delete process.env.ADMIN_USER_IDS;
    expect(isAdmin('auth0|a')).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});
