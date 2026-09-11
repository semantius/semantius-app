import { expect, test } from '@playwright/test'
import { exchangeApiKeyForToken } from '../src/test/exchangeApiKeyForToken'

/**
 * The page behind a modal Sheet is inert — and comes back.
 *
 * Base UI traps Tab inside its dialog, but what it hides from assistive
 * technology is marked once, at open, and it exempts live regions; a record
 * opened by DEEP LINK mounts its Sheet before the grid renders, so the grid
 * behind it stayed fully exposed and focusable from script (see
 * components/a11y/ModalInert.tsx). This proves the app's own `inert` covers
 * that, and — the part that could silently regress — that it comes OFF before
 * Base UI returns focus to the opener, or every Escape would drop focus on
 * <body>.
 */

const RECORD_PATH = '/nwind/orders/11077'
const LIST_PATH = '/nwind/orders'

let token: string

test.beforeAll(async () => {
  token = (await exchangeApiKeyForToken()).access_token
})

test('a deep-linked record Sheet makes the page behind it inert', async ({ page }) => {
  await page.goto(`${RECORD_PATH}#jwt=${token}`)

  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  // The grid behind the Sheet has rendered by now — the state Base UI's own
  // marking misses.
  await expect(page.locator('#page-number-input')).toHaveCount(1, { timeout: 30_000 })

  await expect(page.locator('#root')).toHaveAttribute('inert', '')
  // Inert content cannot take focus, from a user or from script.
  const took = await page.evaluate(() => {
    const el = document.getElementById('page-number-input') as HTMLElement | null
    el?.focus()
    return document.activeElement === el
  })
  expect(took).toBe(false)
  // And the Sheet itself is untouched: its controls still focus.
  await sheet.getByRole('button', { name: /close/i }).focus()
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent)).toMatch(/close/i)
})

test('closing the Sheet lifts inert first, so focus returns to the opener', async ({ page }) => {
  await page.goto(`${LIST_PATH}#jwt=${token}`)
  const rowLink = page.locator('tbody a[href*="/nwind/orders/"]').first()
  await expect(rowLink).toBeVisible({ timeout: 30_000 })

  // Open by keyboard, so there is a real opener to return to.
  await rowLink.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('#root')).toHaveAttribute('inert', '')

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
  // Focus came back into the page — to the opener, not to <body>.
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
  expect(await page.evaluate(() => document.activeElement?.closest('#root') !== null)).toBe(true)
})
