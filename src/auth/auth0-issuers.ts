/**
 * Issuers whose access tokens the API accepts.
 *
 * One Auth0 tenant can issue tokens under more than one name: its canonical domain
 * (AUTH0_ISSUER, e.g. https://skriin.us.auth0.com/) and any custom domain users sign in
 * through (e.g. https://auth.skriin.com/, which the mobile app uses). The tokens are signed
 * with the same keys either way; only the `iss` claim differs. AUTH0_ISSUER_ALIASES is an
 * optional comma-separated list of those other names.
 */
export function auth0Issuers(env: NodeJS.ProcessEnv = process.env): string[] {
  const names = [
    env.AUTH0_ISSUER,
    ...(env.AUTH0_ISSUER_ALIASES ?? '').split(','),
  ]
    .map((name) => name?.trim())
    .filter((name): name is string => !!name)
    // Auth0 issuers always end in a slash; tolerate aliases configured without one.
    .map((name) => (name.endsWith('/') ? name : `${name}/`));
  return [...new Set(names)];
}
