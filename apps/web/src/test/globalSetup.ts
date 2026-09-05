import type { TestProject } from 'vitest/node'
import { exchangeApiKeyForToken } from './exchangeApiKeyForToken'

/**
 * Mint ONE access token for the whole run and hand it to every project.
 *
 * This is the second of the two substitutions the suite is allowed (see
 * `substitutions.test.ts`): a real session against the real tenant, obtained
 * without driving the interactive redirect. It is defensible only because
 * `e2e/login-journey.spec.ts` drives that redirect once, for real, against the
 * OIDC test server. Everything downstream of the token — the API calls, the
 * PostgREST errors, the row shapes — is real.
 *
 * WHY globalSetup and not `#jwt`. `devUrlToken.ts` reads a token off the URL
 * fragment, but it is gated on a build-time `VITE_CONTROL_PLANE_ORG` AND a
 * localhost/workers.dev host. That gate is a PRODUCTION SAFEGUARD, not a test
 * API — routing tests through it would mean the safeguard is load-bearing for
 * the suite and can never be tightened. Tests seed the storage keys directly
 * (see `seedSession` below), which is what `devUrlToken` does anyway.
 *
 * WHY the root config and not inside a project. A `globalSetup` declared at the
 * root provides to EVERY project; one declared inside `browser` provides only
 * there, and the `node` project's real-request tests need the token too.
 *
 * The exchange runs in node, where `SEMANTIUS_API_KEY` lives — it is
 * deliberately not `VITE_`-prefixed, so it never reaches a browser bundle. Only
 * the resulting bearer token crosses over.
 */
export default async function setup(project: TestProject) {
  const org = process.env.VITE_CONTROL_PLANE_ORG
  if (!process.env.SEMANTIUS_API_KEY || !org) {
    throw new Error(
      'Vitest globalSetup: SEMANTIUS_API_KEY and VITE_CONTROL_PLANE_ORG must be set. ' +
        'Run the suite through dotenvx (`pnpm check`, or `dotenvx run -- pnpm test`); ' +
        'in CI the DOTENV_PRIVATE_KEY secret has to reach the step.',
    )
  }

  const { access_token, expires_in } = await exchangeApiKeyForToken()

  // Everything provided must survive structuredClone, so these are primitives.
  project.provide('accessToken', access_token)
  project.provide('tokenExpiresAt', Date.now() + (expires_in ?? 3600) * 1000)
  project.provide('orgSlug', org)
}
