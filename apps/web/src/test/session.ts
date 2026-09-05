import { inject } from 'vitest'

/**
 * Seed the storage keys `react-oauth2-code-pkce` reads, so the app boots
 * already-authenticated against the real tenant.
 *
 * The token comes from `src/test/globalSetup.ts`, which mints exactly one per
 * run via the `client_credentials` grant. This writes it where the library
 * looks: `AuthContext.tsx` sets `storageKeyPrefix: \`SC_${MODE}_\``, and the
 * same two keys are what `lib/devUrlToken.ts` seeds from a `#jwt` fragment.
 *
 * The two keys are written in DIFFERENT formats and that is not a slip: the
 * library JSON-encodes the token (a raw string is read back as `undefined` and
 * the app silently boots signed out) but stores the expiry as a bare number.
 * `devUrlToken.ts` does exactly this; keep the two in step.
 */
export function seedSession(): string {
  const token = inject('accessToken')
  const prefix = `SC_${import.meta.env.MODE}_`
  localStorage.setItem(`${prefix}token`, JSON.stringify(token))
  localStorage.setItem(`${prefix}tokenExpire`, String(Math.floor(inject('tokenExpiresAt') / 1000)))
  return token
}

/** Drop the seeded session. */
export function clearSession(): void {
  const prefix = `SC_${import.meta.env.MODE}_`
  localStorage.removeItem(`${prefix}token`)
  localStorage.removeItem(`${prefix}tokenExpire`)
}

/** The bearer token itself, for a test that calls the API directly. */
export function testToken(): string {
  return inject('accessToken')
}
