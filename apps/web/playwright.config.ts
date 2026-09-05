import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright is here for exactly one thing that Vitest browser mode cannot do.
 *
 * `react-oauth2-code-pkce` starts a login with
 * `window.location[navigationMethod](loginUrl)` — a full top-level navigation
 * away from the app. A component test cannot survive that: the redirect destroys
 * the test context along with the assertions. Playwright drives a real browser
 * across real navigations, so the interactive PKCE round trip is testable here
 * and nowhere else.
 *
 * Everything else the suite needs auth for uses the `#jwt` session-seeding
 * bypass. That bypass is only honest because THIS test exists: it is the one
 * place the real login journey runs end to end.
 *
 * WHAT IT DOES NOT PROVE. `test-oidc-server` does not enforce PKCE — its
 * authorization code carries no `code_challenge`, and `/token` will issue a token
 * for a deliberately wrong `code_verifier`. So this proves the app completes the
 * round trip and handles the callback correctly; it does NOT prove the PKCE
 * implementation is cryptographically correct, and nothing else in the suite
 * does either.
 */

const PORT = 4173
const HOST = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  use: {
    baseURL: HOST,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A REAL BUILD, not the dev server. The login flow depends on
    // `VITE_CONTROL_PLANE_ORG` and `VITE_OAUTH_CONFIG` being inlined at build
    // time; a dev server would resolve them differently and test a configuration
    // that never ships.
    command: `pnpm exec vite build --mode e2e && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: HOST,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      // Point the app at the test identity provider. It is a real OIDC provider
      // — discovery document, RS256 tokens, JWKS, working /userinfo — so the
      // app's own auth code runs against it unmodified. It is a fixture of
      // identities, not a mock.
      VITE_OAUTH_CONFIG:
        'https://test-oidc-server.ma532.workers.dev/.well-known/openid-configuration',
      VITE_OAUTH_CLIENT_ID: 'public-client',
      // An EXPLICIT empty string is the self-hosted opt-out. Unset is not: an
      // unset control-plane URL falls back to the production default, and the
      // suite would then authenticate against production with nothing to say so.
      VITE_CONTROL_PLANE_URL: '',
      // Marks this as a test build (it also gates the `#jwt` bypass), and is
      // required for `initConfig()` to take the self-hosted path.
      VITE_CONTROL_PLANE_ORG: 'e2e',
      VITE_API_BASE_URL: 'https://test-oidc-server.ma532.workers.dev/not-an-api',
    },
  },
})
