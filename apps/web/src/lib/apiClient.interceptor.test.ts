import { describe, it, expect, beforeAll } from 'vitest'
import { tryGetConfig } from './config'
import { setInterceptorToken } from './apiClient'
import { bootApp } from '@/test/appHarness'
import { testToken } from '@/test/session'

/**
 * The global fetch interceptor, across the boot boundary.
 *
 * WHAT CHANGED AND WHY. This ran in `node` with `globalThis.fetch` replaced by a
 * `vi.fn()`, and asserted the arguments the interceptor forwarded to it. Two
 * problems. The interceptor is BROWSER code — it exists so that a relative URL
 * in page script becomes an API call — and in node a relative URL cannot even be
 * fetched, so the central case could not really happen. And a spy on the
 * downstream can only report what it was called with; it cannot show that the
 * resulting request was legal, reached anything, or carried the header the
 * server needed.
 *
 * So it moved to the browser project, and the observations are the browser's
 * own: resource timing for WHERE a request went, and a real API answer for what
 * the interceptor built. Nothing is replaced.
 *
 * ORDER MATTERS HERE, and is enforced rather than assumed. The first block is
 * about the state before `initConfig()` resolves — `_config` still null, which
 * is a one-way door within a page — so it asserts that precondition instead of
 * trusting that nobody reorders the file.
 */

/** The one URL used for the pre-boot relative case; nothing serves it. */
const RELATIVE = '/.well-known/openid-configuration'

/**
 * Did the browser request exactly this url?
 *
 * Polled, because a resource-timing entry is recorded when the response is
 * COMPLETE, and `await fetch()` resolves as soon as the headers are in — an
 * immediate read races the entry and fails about as often as it passes.
 */
async function expectRequested(url: string): Promise<void> {
  await expect
    .poll(
      () => performance.getEntriesByType('resource').some((entry) => entry.name === url),
      { timeout: 15000, interval: 100 },
    )
    .toBe(true)
}

describe('fetch interceptor — before initConfig() has resolved', () => {
  beforeAll(() => {
    performance.clearResourceTimings()
  })

  it('installs itself over the fetch that was there', () => {
    // The interceptor patches the global at module load; importing anything
    // that pulls `apiClient` in is enough, and this file does.
    expect(globalThis.fetch.name).toBe('interceptedFetch')
  })

  it('passes a relative fetch through untouched instead of throwing', async () => {
    // The precondition this whole block rests on.
    expect(tryGetConfig()).toBeNull()

    // The regression: initConfig()'s own OIDC discovery fetch is relative when
    // VITE_OAUTH_CONFIG is origin-relative, and an interceptor that consulted
    // getConfig() here threw "App config not initialized" — a blocked boot on
    // every self-hosted deployment shipping the relative default.
    await expect(fetch(RELATIVE)).resolves.toBeInstanceOf(Response)
    // Resolved against the origin by the browser, not prefixed by us.
    await expectRequested(`${window.location.origin}${RELATIVE}`)
  })

  it('passes an absolute fetch through untouched, as always', async () => {
    const absolute = 'https://test-oidc-server.ma532.workers.dev/.well-known/openid-configuration'

    await fetch(absolute)

    await expectRequested(absolute)
  })
})

describe('fetch interceptor — once the config is in', () => {
  beforeAll(async () => {
    await bootApp()
  })

  it('turns a relative path into a call on the tenant’s API, carrying the token', async () => {
    setInterceptorToken(testToken())

    // No base url, no headers: this is what a call site inside the app writes,
    // and everything that makes it a valid authenticated request is added by
    // the interceptor.
    const res = await fetch('/modules?limit=1')

    expect(res.status).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
    await expectRequested(`${tryGetConfig()!.apiBaseUrl}/modules?limit=1`)
  })

  it('asks ONCE for a table that is not there — PostgREST’s own 404 is definitive', async () => {
    // A bare 404 under the API base is retried as a cold start (lib/retry.ts),
    // which would make every missing table cost the whole retry budget. The
    // tenant's PostgREST names what it could not find, with a `code`, and that
    // body is what makes the 404 final on the first answer.
    setInterceptorToken(testToken())
    const path = '/no_such_table_used_by_the_interceptor_test?limit=1'
    const url = `${tryGetConfig()!.apiBaseUrl}${path}`

    const res = await fetch(path)

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: expect.any(String) })
    await expectRequested(url)
    // A retry, had there been one, would have followed within the first
    // backoff window (300ms). A second is long enough to be sure there was none.
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(performance.getEntriesByType('resource').filter((entry) => entry.name === url)).toHaveLength(1)
  })

  it('sends the same request unauthenticated when there is no token', async () => {
    setInterceptorToken(null)

    const res = await fetch('/modules?limit=1')

    // PostgREST's own words for a request with no bearer token. The route was
    // still resolved — the interceptor's two jobs are independent.
    expect(res.ok).toBe(false)
    expect(JSON.stringify(await res.json())).toMatch(/authenticat|jwt/i)
  })
})
