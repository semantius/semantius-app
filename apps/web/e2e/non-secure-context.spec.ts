import { expect, test } from '@playwright/test'

/**
 * Boot stops at the configuration screen on a non-secure origin.
 *
 * PKCE needs `crypto.subtle`, which browsers withhold outside a secure context
 * (HTTPS, or the `localhost` exemption). Reaching a plain-HTTP deployment over
 * a LAN address is exactly that case, and `initConfig()` prechecks the
 * CAPABILITY before resolving any endpoint or offering any login
 * (`lib/secureContext.ts`, `lib/config.ts`).
 *
 * The rule is a pure function and is unit-tested. What no unit test can show
 * is the short-circuit as a browser experiences it: this project is served from
 * the machine's own LAN address (`playwright.config.ts`, the `lan` project), so
 * `window.isSecureContext` is REALLY false — nothing is stubbed — and the
 * assertions are what a user would see: the boot overlay down, the
 * configuration error naming this origin, and no redirect to an identity
 * provider that could never complete the flow.
 */

test('a plain-HTTP LAN origin gets the configuration error, not a login', async ({ page, baseURL }) => {
  // Precondition, asserted rather than assumed: this really is a non-secure
  // context. If the machine's address ever resolved to something Chromium
  // treats as potentially trustworthy, every assertion below would be vacuous.
  await page.goto('/')
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false)

  await expect(page.getByRole('heading', { level: 1, name: 'Configuration Error' })).toBeVisible({
    timeout: 30_000,
  })
  const detail = page.locator('pre')
  await expect(detail).toContainText('crypto.subtle')
  await expect(detail).toContainText(new URL(baseURL!).origin)

  // The hang invariant: a terminal screen has to take the boot overlay down.
  await expect
    .poll(() => page.evaluate(() => document.getElementById('app-loader')?.hasAttribute('hidden') ?? true))
    .toBe(true)

  // And it stayed here. A login that had been started would have navigated
  // away to the identity provider by now.
  await page.waitForTimeout(1_500)
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
})
