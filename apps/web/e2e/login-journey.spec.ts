import { expect, test, type Page } from '@playwright/test'

/**
 * The real login journey, end to end, with nothing stubbed.
 *
 * This is the test that makes the rest of the suite's session-seeding bypass
 * honest. Everything else hands the app a ready token through the `#jwt`
 * fragment, which is a genuine substitution; it is defensible only because the
 * interactive path is covered somewhere, once, for real. This is that place.
 *
 * Why it cannot be a component test: `react-oauth2-code-pkce` starts the flow
 * with a full top-level `window.location` navigation, which destroys a
 * component test's context along with its assertions.
 *
 * The identity provider is `test-oidc-server.ma532.workers.dev` — a real OIDC
 * provider that exists to be tested against. Verified properties it relies on:
 * it accepts any `redirect_uri` (so there is no registration step and no
 * `invalid_redirect` — that failure belongs to the production control-plane IdP,
 * not here), and its `/authorize` page is a plain username/password form.
 */

const IDP = 'https://test-oidc-server.ma532.workers.dev'
// Must match playwright.config.ts's webServer port.
const APP_ORIGIN = 'http://localhost:4173'

// From the documented test account list.
const USER = { username: 'user3', password: 'password789', email: 'admin@test.com' }

test.describe('OAuth2 authorization-code login', () => {
  test('signs in through the identity provider and lands back in the app', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('pageerror', (err) => consoleErrors.push(String(err)))

    // 1. The app redirects an unauthenticated visitor to /login, which calls
    //    logIn() and navigates to the IdP.
    await page.goto('/')
    await page.waitForURL((url) => url.origin === IDP, { timeout: 30_000 })

    const authorizeUrl = new URL(page.url())
    expect(authorizeUrl.pathname).toBe('/authorize')
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code')
    // The redirect_uri is hardcoded to `${origin}/oauth2_callback` in
    // AuthContext — asserting it here is what catches a change to that contract
    // before it becomes an `invalid_redirect` in a real deployment.
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(`${APP_ORIGIN}/oauth2_callback`)

    // 2. Sign in on the IdP's own form.
    await page.fill('input[name="username"]', USER.username)
    await page.fill('input[name="password"]', USER.password)
    await Promise.all([
      page.waitForURL((url) => url.hostname === 'localhost', { timeout: 30_000 }),
      page.click('button[type="submit"]'),
    ])

    // 3. The callback route exchanges the code for a token. It must NOT still be
    //    sitting on /oauth2_callback: that route holds the boot overlay across
    //    the whole tail of the boot, so a stall there is an infinite spinner.
    await page.waitForURL((url) => !url.pathname.startsWith('/oauth2_callback'), {
      timeout: 30_000,
    })

    // 4. The app is authenticated: the library's own storage keys are seeded.
    const token = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => /^SC_.*_token$/.test(k))
      return key ? localStorage.getItem(key) : null
    })
    expect(token, 'no access token was stored after the token exchange').toBeTruthy()
    expect(String(token)).toContain('eyJ')

    // 5. The boot overlay came down. A page that authenticates and then leaves
    //    the overlay up is a hang, not a success — and it is invisible to any
    //    assertion about the URL or storage.
    await expect
      .poll(
        () => page.evaluate(() => document.getElementById('app-loader')?.hasAttribute('hidden') ?? true),
        { timeout: 15_000 },
      )
      .toBe(true)

    expect(consoleErrors, 'uncaught errors during the login journey').toEqual([])
  })

  test('a callback with no login in progress restarts the login instead of hanging', async ({ page }) => {
    // A code in the URL is not enough for react-oauth2-code-pkce to attempt the
    // exchange: it does so only while its own `loginInProgress` flag is set, and
    // a fresh session — a bookmarked or replayed callback URL — has no such flag.
    // The route's five-second fallback then restarts the login rather than
    // leaving the boot overlay up forever. Assert that path, and that no token
    // request was made: an earlier version of this test navigated here and
    // waited for the failed-exchange error page, which it could never reach,
    // because this is the path it was actually on.
    const tokenRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().startsWith(`${IDP}/token`)) tokenRequests.push(request.url())
    })

    await page.goto('/oauth2_callback?code=not-from-any-login&state=%7B%7D')
    await page.waitForURL((url) => url.origin === IDP, { timeout: 30_000 })

    expect(new URL(page.url()).pathname).toBe('/authorize')
    expect(tokenRequests).toEqual([])
  })

  // Every token exchange fails. The exchange has to be reached the real way,
  // through the provider, so the library's loginInProgress flag and PKCE
  // verifier are in place.
  const failEveryTokenExchange = async (page: Page) => {
    const attempts: number[] = []
    await page.route(`${IDP}/token`, (route) => {
      attempts.push(Date.now())
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: '{"error":"invalid_grant"}',
      })
    })
    return attempts
  }

  // The provider may show its form again on a later visit or, holding a
  // session, redirect straight back; either way the exchange is what counts.
  const signInIfAsked = async (page: Page) => {
    const username = page.locator('input[name="username"]')
    const asked = await username.waitFor({ state: 'visible', timeout: 15_000 }).then(
      () => true,
      () => false,
    )
    if (!asked) return
    await username.fill(USER.username)
    await page.fill('input[name="password"]', USER.password)
    await page.click('button[type="submit"]')
  }

  // Writes the callback's retry record before the app boots. /logout-success is
  // a plain route that needs no session, so it is a page on the app's origin
  // that starts no login.
  const seedRetryRecord = async (page: Page, ageMs: number) => {
    await page.goto('/logout-success')
    await page.evaluate((at) => {
      localStorage.setItem('SC_oauth_retry', JSON.stringify({ count: 1, at }))
    }, Date.now() - ageMs)
  }

  // Named, not just `level: 1`: every standalone page carries an <h1>, so
  // "some h1 appeared" does not distinguish the failure page from any other.
  const loginError = (page: Page) => page.getByRole('heading', { level: 1, name: /Login Error/ })

  test('a token exchange that keeps failing surfaces an error instead of looping', async ({ page }) => {
    // logIn() / logOut() in react-oauth2-code-pkce are fire-and-forget: the
    // library swallows its own rejection and the message surfaces ONLY as
    // useAuth().error. A callback that cannot complete therefore has exactly one
    // way to be visible — AuthFailure — and if that branch regresses the user
    // gets the boot overlay forever.
    //
    // It has to fail TWICE. The callback route recovers from the first failure
    // with one fresh logIn() (an expired or replayed code is the common case)
    // and shows the error only when a second failure follows within the window.
    //
    // A failure recorded two minutes ago is seeded first: it is outside the
    // window, so it must not cost this failure its retry. (The budget used to be
    // a counter only a success reset, and a tab that had once spent its retry
    // showed every later failure at once.)
    await seedRetryRecord(page, 120_000)
    const tokenAttempts = await failEveryTokenExchange(page)

    // Every time the error card is in the DOM, record when — sessionStorage on
    // the app's origin survives the redirects through the provider.
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (!/Login Error/.test(document.querySelector('h1')?.textContent ?? '')) return
        const seen = JSON.parse(sessionStorage.getItem('e2e_login_error_seen') ?? '[]')
        sessionStorage.setItem('e2e_login_error_seen', JSON.stringify([...seen, Date.now()]))
      }).observe(document, { childList: true, subtree: true })
    })

    await page.goto('/')
    await signInIfAsked(page)
    await expect.poll(() => tokenAttempts.length, { timeout: 30_000 }).toBe(1)
    // The automatic retry is a fresh logIn(): back to the provider once more.
    await signInIfAsked(page)
    await expect.poll(() => tokenAttempts.length, { timeout: 30_000 }).toBe(2)

    await expect(loginError(page)).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(() => page.evaluate(() => document.getElementById('app-loader')?.hasAttribute('hidden') ?? true))
      .toBe(true)
    // Still two once the error is up: one automatic retry, then a human, never a loop.
    expect(tokenAttempts).toHaveLength(2)

    // The first failure was retried behind the overlay: the card never rendered
    // before the second exchange. It used to, for as long as the redirect took.
    const seen: number[] = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('e2e_login_error_seen') ?? '[]'),
    )
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((at) => at >= tokenAttempts[1])).toBe(true)
  })

  test('a failure within a minute of another, in any tab, is shown without a retry', async ({ page }) => {
    // The record is shared through localStorage, so a failure another tab
    // recorded ten seconds ago means this one is the second in the window.
    await seedRetryRecord(page, 10_000)
    const tokenAttempts = await failEveryTokenExchange(page)

    await page.goto('/')
    await signInIfAsked(page)

    await expect(loginError(page)).toBeVisible({ timeout: 30_000 })
    expect(tokenAttempts).toHaveLength(1)
  })

  test('Try Again shows a spinner and is disabled while the login restarts', async ({ page }) => {
    await seedRetryRecord(page, 10_000)
    await failEveryTokenExchange(page)

    await page.goto('/')
    await signInIfAsked(page)
    await expect(loginError(page)).toBeVisible({ timeout: 30_000 })

    const tryAgain = page.getByRole('button', { name: 'Try Again' })
    await expect(tryAgain).toBeEnabled()

    // Keep the clicked page on screen: a 204 answer to a navigation leaves the
    // current document in place, so the redirect to the provider starts and
    // goes nowhere. (Leaving the request unanswered instead keeps Playwright
    // waiting on the pending navigation, and nothing can be observed.)
    await page.route(`${IDP}/authorize**`, (route) => route.fulfill({ status: 204 }))
    await tryAgain.click()

    await expect(tryAgain).toBeDisabled()
    await expect(tryAgain).toHaveAttribute('aria-busy', 'true')
    await expect(tryAgain.locator('svg.animate-spin')).toBeVisible()
  })
})
