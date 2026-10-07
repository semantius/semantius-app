import { expect, test, type Page } from '@playwright/test'
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
 *
 * It reads Administration's `roles`: the platform's own module exists on every
 * backend, a sample module like Northwind does not. No record id is assumed —
 * the deep link is taken from a row the grid actually rendered.
 */

const LIST_PATH = '/admin/roles'

let token: string

test.beforeAll(async () => {
  token = (await exchangeApiKeyForToken()).access_token
})

/** The grid's first record link — the label cell of its first row. */
function firstRowLink(page: Page) {
  return page.locator(`tbody a[href*="${LIST_PATH}/"]`).first()
}

test('a deep-linked record Sheet makes the page behind it inert', async ({ page }) => {
  await page.goto(`${LIST_PATH}#jwt=${token}`)
  const recordPath = await firstRowLink(page).getAttribute('href', { timeout: 30_000 })
  expect(recordPath).toBeTruthy()

  // A fresh document at the record's url — the deep link, not a row click.
  await page.goto(recordPath!)

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
  const rowLink = firstRowLink(page)
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
