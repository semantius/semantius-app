import { expect, test } from '@playwright/test'

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

  test('a failed token exchange surfaces an error instead of spinning forever', async ({ page }) => {
    // logIn() / logOut() in react-oauth2-code-pkce are fire-and-forget: the
    // library swallows its own rejection and the message surfaces ONLY as
    // useAuth().error. A callback that cannot complete therefore has exactly one
    // way to be visible — AuthFailure — and if that branch regresses the user
    // gets the boot overlay forever.
    await page.route(`${IDP}/token`, (route) => route.fulfill({ status: 400, body: '{"error":"invalid_grant"}' }))

    await page.goto('/oauth2_callback?code=deliberately-invalid&state=%7B%7D')

    // Named, not just `level: 1`: every standalone page now carries an <h1>, so
    // "some h1 appeared" no longer distinguishes the failure page from any other
    // page this could have landed on.
    await expect(page.getByRole('heading', { level: 1, name: /Login Error/ })).toBeVisible({
      timeout: 30_000,
    })
    await expect
      .poll(() => page.evaluate(() => document.getElementById('app-loader')?.hasAttribute('hidden') ?? true))
      .toBe(true)
  })
})
