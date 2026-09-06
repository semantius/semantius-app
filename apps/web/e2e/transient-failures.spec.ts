import { expect, test, type Page, type Route } from '@playwright/test'
import { exchangeApiKeyForToken } from '../src/test/exchangeApiKeyForToken'

/**
 * A transient failure must never reach the user as text.
 *
 * OBSERVED, NOT HYPOTHETICAL. During the accessibility audits the identity
 * provider's `/userinfo` answered `429` when pages loaded every few seconds, and
 * the app rendered a terminal card — "Failed to fetch user information from
 * OAuth provider — Failed to fetch user info: 429", a Details button, and
 * nothing else. Nineteen cells in one run. The tenant's serverless PostgREST
 * does the same thing with a `404` on the first request after an idle period:
 * the app shows "Failed to fetch user information from API" and a reload fixes
 * it. A rate limit and a cold start are transient by definition; showing either
 * as a hard failure is wrong.
 *
 * WHY THIS RUNS AGAINST THE REAL TENANT. The failure has to be injected into a
 * request that would otherwise have SUCCEEDED — that is the whole claim: the app
 * recovers and the user sees nothing. Against a build with no API behind it, an
 * "error card did not appear" assertion would prove nothing, because the request
 * had no answer to recover to. So this project builds the app in production's
 * shape (control-plane path, the tenant's own PostgREST and OAuth endpoints) and
 * seeds the session with a real token through `#jwt`.
 *
 * WHAT IS SUBSTITUTED, AND WHY IT IS ALLOWED. `page.route` interception, exactly
 * as `login-journey.spec.ts` already uses it for a failed token exchange. It
 * replaces no application code and describes no response the server would not
 * send: the failing attempts are real HTTP status codes, and every attempt after
 * them is passed through to the real endpoint untouched.
 */

const USERINFO = /\/api\/auth\/oauth2\/userinfo(\?|$)/
const RPC_USERINFO = /\/rpc\/get_userinfo(\?|$)/
/** The sidebar's own table read — a query, not a boot endpoint. */
const MODULES_QUERY = /\/modules\?/

/** The two terminal cards this whole file exists to keep off the screen. */
const PROVIDER_CARD = 'Failed to fetch user information from OAuth provider'
const API_CARD = 'Failed to fetch user information from API'

let token: string

test.beforeAll(async () => {
  // The same client_credentials exchange `src/test/globalSetup.ts` uses for the
  // Vitest run. Needs SEMANTIUS_API_KEY, which the `test:e2e` script injects
  // with dotenvx; without it this throws here rather than failing obscurely
  // later.
  token = (await exchangeApiKeyForToken()).access_token
})

/**
 * Answer the first `times` matching requests with `status`, then get out of the
 * way. Returns a counter so a test can assert the failures really happened —
 * otherwise "no error card" could just mean the interception never fired.
 */
async function failFirst(
  page: Page,
  pattern: RegExp,
  { times, status, retryAfter }: { times: number; status: number; retryAfter?: string },
) {
  const attempts = { failed: 0, total: 0 }
  await page.route(pattern, async (route: Route) => {
    attempts.total += 1
    if (attempts.failed < times) {
      attempts.failed += 1
      return route.fulfill({
        status,
        contentType: 'application/json',
        headers: retryAfter ? { 'retry-after': retryAfter } : {},
        body: JSON.stringify({ message: `injected ${status}` }),
      })
    }
    return route.fallback()
  })
  return attempts
}

/** Boot the app signed in, with the token in the fragment (never the query). */
async function signIn(page: Page) {
  await page.goto(`/#jwt=${token}`)
}

test.describe('a transient failure never reaches the user', () => {
  test('a rate-limited userinfo is retried, not shown', async ({ page }) => {
    const attempts = await failFirst(page, USERINFO, { times: 2, status: 429, retryAfter: '1' })

    await signIn(page)

    // The app arrives: the sidebar is rendered, which only happens past the
    // ProtectedRoute gate.
    await expect(page.getByRole('button', { name: /Northwind/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(PROVIDER_CARD)).toHaveCount(0)
    // The 429s really were served — otherwise this test proves nothing.
    expect(attempts.failed).toBe(2)
    expect(attempts.total).toBeGreaterThan(2)
  })

  test('a cold-start 404 from the API is retried, not shown', async ({ page }) => {
    // The tenant's serverless PostgREST answers the first request after an idle
    // period this way. It is indistinguishable from a real 404 by status alone,
    // which is why the app must retry a bounded number of times rather than
    // treat every 404 as terminal.
    const attempts = await failFirst(page, RPC_USERINFO, { times: 1, status: 404 })

    await signIn(page)

    await expect(page.getByRole('button', { name: /Northwind/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(API_CARD)).toHaveCount(0)
    expect(attempts.failed).toBe(1)
    expect(attempts.total).toBeGreaterThan(1)
  })

  test('a rate-limited data query is retried, not shown', async ({ page }) => {
    // Not a boot endpoint: an ordinary table read, through useTable and the
    // query client. Its retry predicate is what has to recognize the 429 —
    // `retry: 1` used to give up after one attempt AND repeat requests the
    // server had refused outright.
    const attempts = await failFirst(page, MODULES_QUERY, { times: 2, status: 429 })

    await signIn(page)

    await expect(page.getByRole('button', { name: /Northwind/i })).toBeVisible({ timeout: 30_000 })
    expect(attempts.failed).toBe(2)
    expect(attempts.total).toBeGreaterThan(2)
  })

  test('a failure that keeps happening IS shown, with the boot overlay down', async ({ page }) => {
    // The other half of the contract, and the reason the retry has to be
    // bounded: an endpoint that is really gone must still produce an error the
    // user can see and act on, not an infinite spinner.
    let served = 0
    await page.route(USERINFO, async (route: Route) => {
      served += 1
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: '{"message":"injected 429"}',
      })
    })

    await signIn(page)

    await expect(page.getByText(PROVIDER_CARD)).toBeVisible({ timeout: 60_000 })
    await expect
      .poll(() =>
        page.evaluate(() => document.getElementById('app-loader')?.hasAttribute('hidden') ?? true),
      )
      .toBe(true)
    // Bounded: it gave up rather than hammering the endpoint forever.
    expect(served).toBeLessThanOrEqual(6)
  })
})
