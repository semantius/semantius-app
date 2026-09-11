import { expect, test, type Page, type Route } from '@playwright/test'
import { exchangeApiKeyForToken } from '../src/test/exchangeApiKeyForToken'
import { MAX_ATTEMPTS } from '../src/lib/retry'

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
 *
 * WHERE THE RETRY LIVES. In the fetch interceptor (`lib/apiClient.ts`, policy in
 * `lib/retry.ts`), which every request passes through — so the second half of
 * this file counts, per request SHAPE, how many times the network saw a request
 * the app made: a read up to the budget, a PostgREST function call the same, a
 * table write exactly once. Those counts are the contract; `retry.test.ts`
 * proves the policy in isolation, this proves the built app applies it.
 */

const USERINFO = /\/api\/auth\/oauth2\/userinfo(\?|$)/
const RPC_USERINFO = /\/rpc\/get_userinfo(\?|$)/
/** The sidebar's own table read — a query, not a boot endpoint. */
const MODULES_QUERY = /\/modules\?/
/** The table route's blocking loader — a PostgREST function call, not a query. */
const GET_SCHEMA = /\/rpc\/get_schema(\?|$)/
/** A table the tenant has, reached through the route whose loader is get_schema. */
const TABLE_PATH = '/nwind/customers'

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
        headers: retryAfter ? exposedRetryAfter(retryAfter) : {},
        body: JSON.stringify({ message: `injected ${status}` }),
      })
    }
    return route.fallback()
  })
  return attempts
}

/**
 * `Retry-After` is not a CORS-safelisted response header. The app's API and
 * identity provider are cross-origin, so `response.headers.get('retry-after')`
 * answers null unless the server ALSO lists it in
 * `Access-Control-Expose-Headers` — a fixture that sends the header without
 * exposing it tests a browser that hides it, and the first version of the
 * budget test failed exactly that way (six attempts instead of one). This is a
 * server-side contract, recorded in lib/retry.ts; the fixture honors it.
 */
function exposedRetryAfter(value: string): Record<string, string> {
  return { 'retry-after': value, 'access-control-expose-headers': 'retry-after' }
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
    expect(served).toBeLessThanOrEqual(MAX_ATTEMPTS)
  })

  test('a rate-limited get_schema is retried — and is never a 404 page', async ({ page }) => {
    // The most severe form this defect took: the table route's loader caught
    // EVERY failure of get_schema and answered notFound(), so a rate limit or a
    // cold start told the user the table did not exist.
    const attempts = await failFirst(page, GET_SCHEMA, { times: 2, status: 429 })

    await page.goto(`${TABLE_PATH}#jwt=${token}`)

    await expect(page.getByRole('heading', { level: 1, name: /customers/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('404 - Page Not Found')).toHaveCount(0)
    expect(attempts.failed).toBe(2)
    expect(attempts.total).toBeGreaterThan(2)
  })

  test('a get_schema that keeps failing is an error with a WORKING retry, not a 404', async ({ page }) => {
    let inject = true
    let served = 0
    await page.route(GET_SCHEMA, async (route: Route) => {
      if (!inject) return route.fallback()
      served += 1
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: '{"message":"injected 429"}',
      })
    })

    await page.goto(`${TABLE_PATH}#jwt=${token}`)

    // The budget spent: an error the user can act on. Not the not-found page.
    const tryAgain = page.getByRole('button', { name: /try again/i })
    await expect(tryAgain).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('404 - Page Not Found')).toHaveCount(0)
    expect(served).toBeLessThanOrEqual(MAX_ATTEMPTS)
    expect(served).toBeGreaterThan(1)

    // And "Try Again" is a new request — the loader runs again — not a
    // re-render of the old failure.
    inject = false
    await tryAgain.click()
    await expect(page.getByRole('heading', { level: 1, name: /customers/i })).toBeVisible({ timeout: 30_000 })
  })
})

/**
 * The attempt counts, per request shape.
 *
 * Each test makes ONE request from inside the page — through the app's own
 * `fetch`, which is the interceptor — against a URL the route handler answers
 * itself, and counts how many times the network saw it. The `probe=` marker
 * keeps the pattern from matching anything the app requests on its own.
 * Nothing reaches the tenant: the handler never falls back.
 */
test.describe('how many times the transport asks', () => {
  async function servedCount(
    page: Page,
    marker: string,
    { status, retryAfter }: { status: number; retryAfter?: string },
  ) {
    const counter = { served: 0 }
    await page.route(new RegExp(`probe=${marker}(&|$)`), async (route: Route) => {
      counter.served += 1
      return route.fulfill({
        status,
        contentType: 'application/json',
        headers: retryAfter ? exposedRetryAfter(retryAfter) : {},
        body: JSON.stringify({ message: `injected ${status}` }),
      })
    })
    return counter
  }

  /** A relative URL from page script: the interceptor resolves it onto the API base. */
  function ask(page: Page, path: string, init?: { method?: string; body?: string }) {
    return page.evaluate(
      ([p, i]) => fetch(p, { ...i, headers: { 'content-type': 'application/json' } }).then((r) => r.status),
      [path, init ?? {}] as const,
    )
  }

  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await expect(page.getByRole('button', { name: /Northwind/i })).toBeVisible({ timeout: 30_000 })
  })

  test('a read: up to the budget', async ({ page }) => {
    const counter = await servedCount(page, 'read', { status: 429 })

    expect(await ask(page, '/customers?limit=1&probe=read')).toBe(429)

    expect(counter.served).toBe(MAX_ATTEMPTS)
  })

  test('a PostgREST function call: up to the budget on a 429', async ({ page }) => {
    const counter = await servedCount(page, 'call', { status: 429 })

    expect(await ask(page, '/rpc/get_schema?probe=call', { method: 'POST', body: '{}' })).toBe(429)

    expect(counter.served).toBe(MAX_ATTEMPTS)
  })

  test('a PostgREST function call: once on a 500, which may have run it', async ({ page }) => {
    const counter = await servedCount(page, 'call500', { status: 500 })

    expect(await ask(page, '/rpc/get_schema?probe=call500', { method: 'POST', body: '{}' })).toBe(500)

    expect(counter.served).toBe(1)
  })

  test('a table write: exactly once, whatever the answer', async ({ page }) => {
    const post = await servedCount(page, 'write', { status: 429 })
    const patch = await servedCount(page, 'patch', { status: 503 })
    const del = await servedCount(page, 'delete', { status: 429 })

    expect(await ask(page, '/customers?probe=write', { method: 'POST', body: '{}' })).toBe(429)
    expect(await ask(page, '/customers?id=eq.1&probe=patch', { method: 'PATCH', body: '{}' })).toBe(503)
    expect(await ask(page, '/customers?id=eq.1&probe=delete', { method: 'DELETE' })).toBe(429)

    expect(post.served).toBe(1)
    expect(patch.served).toBe(1)
    expect(del.served).toBe(1)
  })

  test('a Retry-After beyond the budget ends the attempt at once', async ({ page }) => {
    const counter = await servedCount(page, 'later', { status: 429, retryAfter: '30' })

    expect(await ask(page, '/customers?limit=1&probe=later')).toBe(429)

    expect(counter.served).toBe(1)
  })

  test('a refusal: once', async ({ page }) => {
    const counter = await servedCount(page, 'refused', { status: 403 })

    expect(await ask(page, '/customers?limit=1&probe=refused')).toBe(403)

    expect(counter.served).toBe(1)
  })
})
