import { auth0Issuers } from './auth0-issuers';

describe('auth0Issuers', () => {
  it('accepts just AUTH0_ISSUER when there are no aliases', () => {
    expect(
      auth0Issuers({ AUTH0_ISSUER: 'https://skriin.us.auth0.com/' }),
    ).toEqual(['https://skriin.us.auth0.com/']);
  });

  it('adds a custom domain alias', () => {
    expect(
      auth0Issuers({
        AUTH0_ISSUER: 'https://skriin.us.auth0.com/',
        AUTH0_ISSUER_ALIASES: 'https://auth.skriin.com/',
      }),
    ).toEqual(['https://skriin.us.auth0.com/', 'https://auth.skriin.com/']);
  });

  it('tolerates spaces, empty entries and missing trailing slashes', () => {
    expect(
      auth0Issuers({
        AUTH0_ISSUER: 'https://skriin.us.auth0.com/',
        AUTH0_ISSUER_ALIASES:
          ' https://auth.skriin.com , ,https://login.skriin.com/',
      }),
    ).toEqual([
      'https://skriin.us.auth0.com/',
      'https://auth.skriin.com/',
      'https://login.skriin.com/',
    ]);
  });

  it('drops duplicates', () => {
    expect(
      auth0Issuers({
        AUTH0_ISSUER: 'https://skriin.us.auth0.com/',
        AUTH0_ISSUER_ALIASES: 'https://skriin.us.auth0.com',
      }),
    ).toEqual(['https://skriin.us.auth0.com/']);
  });
});
