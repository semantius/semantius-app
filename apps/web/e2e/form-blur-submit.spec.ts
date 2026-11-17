import { expect, test, type Locator, type Page } from '@playwright/test'
import { exchangeApiKeyForToken } from '../src/test/exchangeApiKeyForToken'

/**
 * On-blur validation and one-press submit, on the built app against the tenant.
 *
 * The Vitest file (`SchemaForm.blur.test.tsx`) covers the form on its own; this
 * covers what only the app has: the record pages, their two submit buttons on
 * `/nwind/orders/new` (the footer Submit and the header "Order Details..."), the
 * app layout the sticky bar lives in, and the reference picker's real list.
 *
 * WINDOWS. 1280x800 is "long": the orders form is taller than the window, so the
 * bar should be pinned. 1280x2400 is "tall": the form fits, the bar is not
 * pinned, and a line appearing above it moves it.
 *
 * OBSERVERS, NOT SUBSTITUTES. `watchPress` records the pressed button's top at
 * each event of the press and counts the form's submit events; `trackSaves`
 * counts the POSTs that save a record. Every measurement is logged as one
 * `[blur]` line. Records a test creates are deleted again in `afterEach`, by
 * the id the POST's own response carried.
 */

const LONG = { width: 1280, height: 800 }
const TALL = { width: 1280, height: 2400 }

const ORDERS_NEW = '/nwind/orders/new'
const CUSTOMERS_NEW = '/nwind/customers/new'
const CUSTOMERS_CREATE = '/nwind/customers/create'

const MUST_NOT_BE_EMPTY = /must not be empty/i

/**
 * A "did not move" check: |delta| < 1 px, the owner's tolerance for sub-pixel
 * rounding (a lost click needs about 16 px).
 */
const NO_MOVE = {
  asymmetricMatch: (delta: unknown) => typeof delta === 'number' && Math.abs(delta) < 1,
  toString: () => 'NoMove',
  toAsymmetricMatcher: () => '|delta| < 1 px',
}

let token: string

test.beforeAll(async () => {
  token = (await exchangeApiKeyForToken()).access_token
})

// --- saves, and cleaning them up ---------------------------------------------

interface Created {
  url: string
  id: unknown
}

interface Saves {
  posts: number
  /** The urls of every PATCH to a saved table, for counting the edits of one record. */
  patches: string[]
  created: Created[]
  pending: Promise<void>[]
}

/** The tables these tests save to. */
const SAVED_TABLES = /\/(orders|customers|territories|regions)$/

function isSave(method: string, url: string): boolean {
  return method === 'POST' && SAVED_TABLES.test(new URL(url).pathname)
}

function trackSaves(page: Page): Saves {
  const saves: Saves = { posts: 0, patches: [], created: [], pending: [] }
  page.on('request', (request) => {
    if (isSave(request.method(), request.url())) saves.posts += 1
    if (request.method() === 'PATCH' && SAVED_TABLES.test(new URL(request.url()).pathname)) saves.patches.push(request.url())
  })
  page.on('response', (response) => {
    const request = response.request()
    if (!isSave(request.method(), request.url()) || !response.ok()) return
    saves.pending.push(
      response
        .json()
        .then((body: unknown) => {
          const row = (Array.isArray(body) ? body[0] : body) as Record<string, unknown> | undefined
          if (row && row.id !== undefined) saves.created.push({ url: request.url().split('?')[0], id: row.id })
        })
        .catch(() => undefined),
    )
  })
  return saves
}

let saves: Saves | undefined

test.afterEach(async () => {
  if (!saves) return
  await Promise.all(saves.pending)
  for (const { url, id } of saves.created) {
    await fetch(`${url}?id=eq.${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  }
  saves = undefined
})

/** The PATCHes sent to one record of `table`. */
function patchesTo(table: string, id: unknown): number {
  return (saves?.patches ?? []).filter((url) => {
    const u = new URL(url)
    return u.pathname.endsWith(`/${table}`) && u.searchParams.get('id') === `eq.${id}`
  }).length
}

// --- records the edit tests start from, made and removed through the API -------

let apiBaseUrl: string | undefined

/** The tenant's PostgREST url, from the same lookup the app makes at boot. */
async function apiBase(): Promise<string> {
  if (apiBaseUrl) return apiBaseUrl
  const org = process.env.VITE_CONTROL_PLANE_ORG
  const res = await fetch(`https://api.semantius.cloud/organization/${encodeURIComponent(org ?? '')}`)
  const tenant = (await res.json()) as { postgrest_url: string }
  apiBaseUrl = tenant.postgrest_url.replace(/\/+$/, '')
  return apiBaseUrl
}

const seeded: Created[] = []

/** Creates a record through the API; `afterEach` deletes it. */
async function seed(table: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = `${await apiBase()}/${table}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`seeding ${table} failed: ${res.status} ${await res.text()}`)
  const [row] = (await res.json()) as Record<string, unknown>[]
  seeded.push({ url, id: row.id })
  return row
}

/** An existing customer's id, for an order's `customer_id`. */
async function anyCustomerId(): Promise<unknown> {
  const res = await fetch(`${await apiBase()}/customers?select=id&company_name=neq.Blur%20Test%20Co&order=id&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const [row] = (await res.json()) as { id: unknown }[]
  return row.id
}

test.afterEach(async () => {
  while (seeded.length > 0) {
    const { url, id } = seeded.pop()!
    await fetch(`${url}?id=eq.${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  }
})

/** The id of the record the save created, once its response has been read. */
async function createdId(): Promise<unknown> {
  await expect.poll(() => saves?.created.length ?? 0, { timeout: 30_000 }).toBeGreaterThan(0)
  return saves!.created[0].id
}

// --- opening a page -----------------------------------------------------------

async function open(page: Page, path: string, viewport: { width: number; height: number }) {
  saves = trackSaves(page)
  await page.setViewportSize(viewport)
  await page.goto(`${path}#jwt=${token}`)
  await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeVisible({ timeout: 30_000 })
}

function submit(page: Page): Locator {
  return page.getByRole('button', { name: 'Submit', exact: true })
}

/** `'Z'` and four random uppercase letters. */
function customerCode(): string {
  return 'Z' + Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')
}

function errorOf(page: Page, name: string): Locator {
  return page.locator(`[id="${name}-error"]`)
}

/** The error shown under a field right now, or null. Does not wait for one. */
function readError(page: Page, name: string): Promise<string | null> {
  return page.evaluate((id) => document.getElementById(`${id}-error`)?.textContent ?? null, name)
}

/** The child list a save through "Order Details..." goes to, filtered to the new order. */
function isChildList(url: URL, id: unknown): boolean {
  return url.pathname === '/nwind/order_details'
    && url.searchParams.get('_pf') === 'order_details.order_id'
    && url.searchParams.get('_pv') === String(id)
}

/** Open the Customer list, wait for options, then ArrowDown and Enter. */
async function chooseCustomer(page: Page) {
  await page.locator('#customer_id').click()
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(page.locator('#customer_id')).not.toContainText(/^Search/)
}

// --- observing a press and the layout -----------------------------------------

interface PressRecord {
  tops: Partial<Record<'pointerdown' | 'mousedown' | 'mouseup' | 'click', number>>
  submits: number
}

/**
 * Capture-phase listeners record the pressed button's top at each event of the
 * press, and the form's submit events are counted. Installed once per document;
 * a second call re-targets the button and zeroes the record.
 *
 * The top is read off the button's PARENT (the row it sits in): `Button` has
 * `active:translate-y-px`, so the button itself is 1px lower while it is held,
 * and that would read as a 1px move on every press.
 */
async function watchPress(button: Locator) {
  await button.evaluate((btn) => {
    type Probe = { button: Element; record: { tops: Record<string, number>; submits: number } }
    const w = window as unknown as { __press?: Probe }
    if (!w.__press) {
      const probe: Probe = { button: btn, record: { tops: {}, submits: 0 } }
      w.__press = probe
      for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
        document.addEventListener(type, () => {
          probe.record.tops[type] = (probe.button.parentElement ?? probe.button).getBoundingClientRect().top
        }, true)
      }
      document.addEventListener('submit', () => {
        probe.record.submits += 1
      }, true)
    }
    w.__press.button = btn
    w.__press.record = { tops: {}, submits: 0 }
  })
}

async function readPress(page: Page): Promise<PressRecord & { delta?: number; touchDelta?: number }> {
  const record = await page.evaluate(() => (window as unknown as { __press: { record: PressRecord } }).__press.record)
  const { tops } = record
  return {
    ...record,
    delta: tops.mousedown !== undefined && tops.mouseup !== undefined ? tops.mouseup - tops.mousedown : undefined,
    touchDelta: tops.pointerdown !== undefined && tops.click !== undefined ? tops.click - tops.pointerdown : undefined,
  }
}

/** A real 250ms press-and-hold, observed. */
async function press(button: Locator) {
  await watchPress(button)
  await button.click({ delay: 250 })
  await button.page().waitForTimeout(400)
  return readPress(button.page())
}

/**
 * The same press, made with the mouse at the button's center instead of through
 * `locator.click()`. Needed while a picker list is open: the list is a
 * `role=dialog` popup, so ModalInert makes `#root` inert, the button stops
 * receiving pointer events, and `click()`'s actionability check waits for it
 * forever. A user pressing there is not refused; the press lands wherever the
 * browser's hit test sends it.
 */
async function pressAt(button: Locator) {
  const page = button.page()
  await watchPress(button)
  const box = await button.boundingBox()
  if (!box) throw new Error('the button has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(250)
  await page.mouse.up()
  await page.waitForTimeout(400)
  return readPress(page)
}

/** Where the bar is, relative to the window and to the form it ends. */
async function barLayout(page: Page) {
  return submit(page).evaluate((btn) => {
    const form = (btn as HTMLButtonElement).form!
    const bar = form.querySelector('[data-slot=sticky-container]')!
    const b = bar.getBoundingClientRect()
    const gridEl = form.querySelector('.grid-container')!
    const g = gridEl.getBoundingClientRect()
    // The form's `space-y-4` is a margin on every child but the last, so the gap
    // above the bar is the grid's bottom margin plus the bar's own top one.
    const gap = parseFloat(getComputedStyle(gridEl).marginBottom) + parseFloat(getComputedStyle(bar).marginTop)
    return {
      barTop: b.top,
      barBottom: b.bottom,
      gridBottom: g.bottom,
      innerHeight: window.innerHeight,
      pinned: Math.abs(b.bottom - window.innerHeight) <= 1 && g.bottom > window.innerHeight,
      rightAfterLastField: Math.abs(b.top - (g.bottom + gap)) <= 1,
    }
  })
}

async function expectUnpinned(page: Page) {
  const layout = await barLayout(page)
  expect(layout.pinned, 'bar not pinned').toBe(false)
  expect(layout.rightAfterLastField, 'bar right after the last field').toBe(true)
  expect(layout.barBottom, 'the form fits the window').toBeLessThanOrEqual(layout.innerHeight)
}

function log(id: string, data: unknown) {
  console.log(`[blur] ${id} ${JSON.stringify(data)}`)
}

// --- B: on-blur validation works ------------------------------------------------

test('B6: the reference picker validates when left closed and when its list closes; choosing clears it', async ({ page }) => {
  await open(page, ORDERS_NEW, TALL)
  await expectUnpinned(page)
  const customer = page.locator('#customer_id')

  // Tab past the closed picker.
  await customer.focus()
  await page.keyboard.press('Tab')
  await expect(errorOf(page, 'customer_id'), 'error after leaving').toHaveText(MUST_NOT_BE_EMPTY)

  // Open the list and press Escape.
  await customer.click()
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(errorOf(page, 'customer_id'), 'error after Escape').toHaveText(MUST_NOT_BE_EMPTY)

  // Open the list and choose.
  await chooseCustomer(page)
  await expect(errorOf(page, 'customer_id'), 'gone after choosing').toHaveCount(0)
})

// --- T: one press counts --------------------------------------------------------

test.describe('orders/new, tall window (bar not pinned)', () => {
  test('T8a: one press of Submit saves once and goes to the list', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)
    await chooseCustomer(page)

    const result = await press(submit(page))
    await expect(page).toHaveURL(/\/nwind\/orders(\?|$)/, { timeout: 30_000 })
    log('T8a', { ...result, posts: saves!.posts })
    expect(saves!.posts).toBe(1)
  })

  test('T8b: one press of Order Details... saves once and goes to the child list', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)
    await chooseCustomer(page)

    const result = await press(page.getByRole('button', { name: 'Order Details...' }))
    const id = await createdId()
    await expect(page).toHaveURL((url) => isChildList(url, id), { timeout: 30_000 })
    log('T8b', { ...result, posts: saves!.posts, id })
    expect(saves!.posts).toBe(1)
  })

  test('T8c: a press with the Customer list open closes it and flags it; the next press saves', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)

    await page.locator('#customer_id').click()
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 30_000 })
    const rootInert = await page.evaluate(() => document.getElementById('root')?.hasAttribute('inert') ?? false)
    const first = await pressAt(submit(page))
    const firstState = {
      rootInert,
      listOpen: await page.getByRole('listbox').count(),
      error: await readError(page, 'customer_id'),
      posts: saves!.posts,
    }
    log('T8c-first', { ...first, ...firstState })
    expect(firstState.listOpen, 'list closed').toBe(0)
    await expect(errorOf(page, 'customer_id'), 'Customer error').toHaveText(MUST_NOT_BE_EMPTY)
    expect(saves!.posts, 'no save').toBe(0)

    await chooseCustomer(page)
    const second = await press(submit(page))
    await expect(page).toHaveURL(/\/nwind\/orders(\?|$)/, { timeout: 30_000 })
    log('T8c-second', { ...second, posts: saves!.posts })
    expect(saves!.posts).toBe(1)
  })

  // T8d–T8h: a failed attempt and a successful save, with BOTH submit buttons,
  // and switching buttons after a failed attempt.

  function orderDetails(page: Page): Locator {
    return page.getByRole('button', { name: 'Order Details...' })
  }

  /**
   * After a press that must fail: the Customer error is what the failed
   * validation shows, and it appears in the same pass that decides not to save,
   * so once it is there a save would already have been sent and a navigation
   * started. Then the URL and the POST count are read.
   */
  async function failedState(page: Page) {
    await expect(errorOf(page, 'customer_id'), 'Customer error').toHaveText(MUST_NOT_BE_EMPTY)
    return { path: new URL(page.url()).pathname, posts: saves!.posts }
  }

  test('T8d: Submit fails with Customer empty, then Submit saves once and goes to the list', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)

    const first = await press(submit(page))
    const firstState = await failedState(page)
    log('T8d-first', { ...first, ...firstState })
    expect({ delta: first.delta, ...firstState }).toEqual({ delta: NO_MOVE, path: ORDERS_NEW, posts: 0 })

    await chooseCustomer(page)
    const second = await press(submit(page))
    await expect(page).toHaveURL(/\/nwind\/orders(\?|$)/, { timeout: 30_000 })
    log('T8d-second', { ...second, posts: saves!.posts, url: page.url() })
    expect(saves!.posts).toBe(1)
  })

  test('T8e: Order Details... fails with Customer empty, then Order Details... saves once and goes to the child list', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)

    const first = await press(orderDetails(page))
    const firstState = await failedState(page)
    log('T8e-first', { ...first, ...firstState })
    expect({ delta: first.delta, ...firstState }).toEqual({ delta: NO_MOVE, path: ORDERS_NEW, posts: 0 })

    await chooseCustomer(page)
    const second = await press(orderDetails(page))
    const id = await createdId()
    await expect(page).toHaveURL((url) => isChildList(url, id), { timeout: 30_000 })
    log('T8e-second', { ...second, posts: saves!.posts, id, url: page.url() })
    expect(saves!.posts).toBe(1)
  })

  test('T8f: Submit fails, then Order Details... saves once and goes to the child list', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)

    const first = await press(submit(page))
    const firstState = await failedState(page)
    log('T8f-first', { ...first, ...firstState })

    await chooseCustomer(page)
    const second = await press(orderDetails(page))
    const id = await createdId()
    await expect(page).toHaveURL((url) => isChildList(url, id), { timeout: 30_000 })
    log('T8f-second', { ...second, posts: saves!.posts, id, url: page.url() })
    expect(saves!.posts).toBe(1)
  })

  test('T8g: Order Details... fails, then Submit saves once and goes to the list, not the child list', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)

    const first = await press(orderDetails(page))
    const firstState = await failedState(page)
    log('T8g-first', { ...first, ...firstState })

    await chooseCustomer(page)
    const second = await press(submit(page))
    await expect(page).toHaveURL(/\/nwind\/orders(\?|$)/, { timeout: 30_000 })
    log('T8g-second', { ...second, posts: saves!.posts, url: page.url() })
    expect(saves!.posts).toBe(1)
  })

  test('T8h: an Order Details... press with the Customer list open closes it and flags it; the next press saves', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)

    await page.locator('#customer_id').click()
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 30_000 })
    const rootInert = await page.evaluate(() => document.getElementById('root')?.hasAttribute('inert') ?? false)
    // pressAt, as in T8c: the open list makes #root inert.
    const first = await pressAt(orderDetails(page))
    const firstState = {
      rootInert,
      listOpen: await page.getByRole('listbox').count(),
      error: await readError(page, 'customer_id'),
      posts: saves!.posts,
      path: new URL(page.url()).pathname,
    }
    log('T8h-first', { ...first, ...firstState })
    expect(firstState.listOpen, 'list closed').toBe(0)
    await expect(errorOf(page, 'customer_id'), 'Customer error').toHaveText(MUST_NOT_BE_EMPTY)
    expect(saves!.posts, 'no save').toBe(0)

    await chooseCustomer(page)
    const second = await press(orderDetails(page))
    const id = await createdId()
    await expect(page).toHaveURL((url) => isChildList(url, id), { timeout: 30_000 })
    log('T8h-second', { ...second, posts: saves!.posts, id, url: page.url() })
    expect(saves!.posts).toBe(1)
  })

  // T8i–T8k (C4, D5): a press while a picker list is open must close the list
  // AND count. The form is valid, so the one press must save. `pressAt`, as in
  // T8c: the open list may make #root inert.

  function rootInert(page: Page): Promise<boolean> {
    return page.evaluate(() => document.getElementById('root')?.hasAttribute('inert') ?? false)
  }

  test('T8i: with a customer chosen and its list reopened, one press of Submit saves and goes to the list', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)
    await chooseCustomer(page)
    await page.locator('#customer_id').click()
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 30_000 })

    const inert = await rootInert(page)
    const result = await pressAt(submit(page))
    try {
      await expect(page).toHaveURL(/\/nwind\/orders(\?|$)/, { timeout: 15_000 })
    } finally {
      log('T8i', { rootInertBeforePress: inert, ...result, posts: saves!.posts, url: page.url() })
    }
    expect(saves!.posts).toBe(1)
  })

  test('T8j: with a customer chosen and its list reopened, one press of Order Details... saves and goes to the child list', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)
    await chooseCustomer(page)
    await page.locator('#customer_id').click()
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 30_000 })

    const inert = await rootInert(page)
    const result = await pressAt(orderDetails(page))
    let id: unknown
    try {
      id = await createdId()
      await expect(page).toHaveURL((url) => isChildList(url, id), { timeout: 15_000 })
    } finally {
      log('T8j', { rootInertBeforePress: inert, ...result, posts: saves!.posts, id, url: page.url() })
    }
    expect(saves!.posts).toBe(1)
  })

  test('T8k: with a customer chosen and the Status list open, one press of Submit saves and goes to the list', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)
    await chooseCustomer(page)
    await page.locator('#status').click()
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 30_000 })

    const inert = await rootInert(page)
    const result = await pressAt(submit(page))
    try {
      await expect(page).toHaveURL(/\/nwind\/orders(\?|$)/, { timeout: 15_000 })
    } finally {
      log('T8k', { rootInertBeforePress: inert, ...result, posts: saves!.posts, url: page.url() })
    }
    expect(saves!.posts).toBe(1)
  })

  test('T15: Enter inside Ship Name submits through the form default button', async ({ page }) => {
    await open(page, ORDERS_NEW, TALL)
    await expectUnpinned(page)
    await chooseCustomer(page)

    await page.locator('#ship_name').click()
    await watchPress(submit(page))
    await page.keyboard.press('Enter')
    const id = await createdId()
    await expect(page).toHaveURL((url) => isChildList(url, id), { timeout: 30_000 })
    log('T15', { ...(await readPress(page)), posts: saves!.posts, id })
    expect(saves!.posts).toBe(1)
  })
})

test.describe('customers/new, tall window (bar not pinned)', () => {
  /** Fill Company Name; Tab past the empty Customer Code; click back and type a code. */
  async function fillAfterTabbingPast(page: Page) {
    await page.locator('#company_name').click()
    await page.keyboard.type('Blur Test Co')
    await page.keyboard.press('Tab')
    await expect(page.locator('#customer_id')).toBeFocused()
    await page.keyboard.press('Tab')
    const errorAfterTab = await readError(page, 'customer_id')
    await page.locator('#customer_id').click()
    await page.keyboard.type(customerCode())
    const errorWhileTyping = await readError(page, 'customer_id')
    return { errorAfterTab, errorWhileTyping }
  }

  test('T11e: the error the press itself clears does not move Submit', async ({ page }) => {
    await open(page, CUSTOMERS_NEW, TALL)
    await expectUnpinned(page)
    const before = await fillAfterTabbingPast(page)

    const result = await press(submit(page))
    await page.waitForTimeout(1000)
    log('T11e', { ...before, ...result, posts: saves!.posts, url: page.url() })
    expect({ posts: saves!.posts, delta: result.delta }).toEqual({ posts: 1, delta: NO_MOVE })
    await expect(page).toHaveURL(/\/nwind\/customers(\?|$)/, { timeout: 30_000 })
  })

  test.describe('with a touch screen', () => {
    test.use({ hasTouch: true })

    test('T10: a tap on Submit after the same steps saves once', async ({ page }) => {
      await open(page, CUSTOMERS_NEW, TALL)
      await expectUnpinned(page)
      const before = await fillAfterTabbingPast(page)

      await watchPress(submit(page))
      await submit(page).tap()
      await page.waitForTimeout(1000)
      const result = await readPress(page)
      log('T10', { ...before, ...result, posts: saves!.posts, url: page.url() })
      expect(saves!.posts).toBe(1)
    })
  })
})

test.describe('long window (1280x800)', () => {
  test('T12: on orders/new the bar is pinned and Submit is visible without scrolling', async ({ page }) => {
    await open(page, ORDERS_NEW, LONG)
    const overflowY = await page.evaluate(() => getComputedStyle(document.getElementById('main-content')!).overflowY)
    const layout = await barLayout(page)
    const submitBox = await submit(page).boundingBox()
    const visible = !!submitBox && submitBox.y >= 0 && submitBox.y + submitBox.height <= LONG.height
    log('T12', { overflowY, ...layout, submitVisible: visible })
    expect(layout.pinned, 'bar pinned').toBe(true)
    expect(visible, 'Submit visible').toBe(true)
  })

  test('T13: in the create Sheet, one press raises both errors; the next saves once', async ({ page }) => {
    await open(page, CUSTOMERS_CREATE, LONG)
    const sheet = page.getByRole('dialog')
    await expect(sheet.locator('#customer_id')).toBeVisible({ timeout: 30_000 })
    const layout = await barLayout(page)

    await sheet.locator('#customer_id').click()
    const first = await press(sheet.getByRole('button', { name: 'Submit', exact: true }))
    const firstErrors = {
      customer_id: await readError(page, 'customer_id'),
      company_name: await readError(page, 'company_name'),
    }
    log('T13-first', { layout, ...first, errors: firstErrors })
    expect(firstErrors).toEqual({
      customer_id: expect.stringMatching(MUST_NOT_BE_EMPTY),
      company_name: expect.stringMatching(MUST_NOT_BE_EMPTY),
    })

    await sheet.locator('#company_name').click()
    await page.keyboard.type('Blur Test Co')
    await sheet.locator('#customer_id').click()
    await page.keyboard.type(customerCode())
    const second = await press(sheet.getByRole('button', { name: 'Submit', exact: true }))
    await expect.poll(() => saves!.posts, { timeout: 30_000 }).toBe(1)
    log('T13-second', { ...second, posts: saves!.posts })
    await page.waitForTimeout(500)
    expect(saves!.posts).toBe(1)
  })

  test('T14: from the bottom of orders/new, one press brings Customer into view and focuses it', async ({ page }) => {
    await open(page, ORDERS_NEW, LONG)
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
    const layout = await barLayout(page)

    const result = await press(submit(page))

    const seen = async () =>
      page.locator('#customer_id').evaluate((el) => {
        const cell = el.closest('.span-2, .span-4, .span-8')!.getBoundingClientRect()
        const bar = (el as HTMLElement).closest('form')!.querySelector('[data-slot=sticky-container]')!.getBoundingClientRect()
        return {
          top: cell.top,
          bottom: cell.bottom,
          limit: Math.min(bar.top, window.innerHeight),
          focused: document.activeElement === el,
        }
      })
    let last = await seen()
    try {
      await expect
        .poll(async () => {
          last = await seen()
          return last.focused && last.top >= 64 && last.bottom <= last.limit
        }, { timeout: 5_000 })
        .toBe(true)
    } finally {
      log('T14-E', { layout, ...result, posts: saves!.posts, seen: last })
    }
  })
})

// --- Owner's additions (T16–T22) -------------------------------------------------

function childButton(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: true })
}

function isRootInert(page: Page): Promise<boolean> {
  return page.evaluate(() => document.getElementById('root')?.hasAttribute('inert') ?? false)
}

/** Lines an element's text takes, by its own line height. */
function linesOf(page: Page, id: string): Promise<number | null> {
  return page.evaluate((elementId) => {
    const el = document.getElementById(elementId)
    if (!el) return null
    return Math.round(el.offsetHeight / parseFloat(getComputedStyle(el).lineHeight))
  }, id)
}

/** Empty the Customer picker with its own clear button. */
async function clearCustomer(page: Page) {
  const clear = page.locator('#customer_id').locator('xpath=..').getByRole('button', { name: 'Clear selection' })
  await clear.click()
  await expect(page.locator('#customer_id')).toContainText(/^Search/)
}

/** Empty a text input the way a user does: select all, delete. */
async function emptyField(field: Locator) {
  await field.click()
  await field.page().keyboard.press('Control+A')
  await field.page().keyboard.press('Backspace')
  await expect(field).toHaveValue('')
}

test.describe('T16: edit forms', () => {
  /** An order made through the API, opened on its edit PAGE (orders have children). */
  async function openOrder(page: Page) {
    const order = await seed('orders', { customer_id: await anyCustomerId() })
    const path = `/nwind/orders/${order.id}/view`
    await open(page, path, TALL)
    await expectUnpinned(page)
    return { id: order.id, path }
  }

  /** After a press that must fail on the edit page: the error, then URL and PATCH count. */
  async function failedEdit(page: Page, id: unknown) {
    await expect(errorOf(page, 'customer_id'), 'Customer error').toHaveText(MUST_NOT_BE_EMPTY)
    return { path: new URL(page.url()).pathname, patches: patchesTo('orders', id) }
  }

  test('T16a: Submit fails with Customer cleared, then Submit saves once and goes to the list', async ({ page }) => {
    const { id, path } = await openOrder(page)
    await clearCustomer(page)

    const first = await press(submit(page))
    const firstState = await failedEdit(page, id)
    log('T16a-first', { ...first, ...firstState })
    expect(firstState).toEqual({ path, patches: 0 })

    await chooseCustomer(page)
    const second = await press(submit(page))
    try {
      await expect(page).toHaveURL(/\/nwind\/orders(\?|$)/, { timeout: 15_000 })
    } finally {
      log('T16a-second', { ...second, patches: patchesTo('orders', id), url: page.url() })
    }
    expect(patchesTo('orders', id)).toBe(1)
  })

  test('T16b: Order Details... fails with Customer cleared, then Order Details... saves once and goes to the child list', async ({ page }) => {
    const { id, path } = await openOrder(page)
    await clearCustomer(page)

    const first = await press(childButton(page, 'Order Details...'))
    const firstState = await failedEdit(page, id)
    log('T16b-first', { ...first, ...firstState })
    expect(firstState).toEqual({ path, patches: 0 })

    await chooseCustomer(page)
    const second = await press(childButton(page, 'Order Details...'))
    try {
      await expect(page).toHaveURL((url) => isChildList(url, id), { timeout: 15_000 })
    } finally {
      log('T16b-second', { ...second, patches: patchesTo('orders', id), url: page.url() })
    }
    expect(patchesTo('orders', id)).toBe(1)
  })

  test('T16c: Order Details... fails, then Submit saves once and goes to the list, not the child list', async ({ page }) => {
    const { id } = await openOrder(page)
    await clearCustomer(page)

    const first = await press(childButton(page, 'Order Details...'))
    const firstState = await failedEdit(page, id)
    log('T16c-first', { ...first, ...firstState })

    await chooseCustomer(page)
    const second = await press(submit(page))
    try {
      await expect(page).toHaveURL(/\/nwind\/orders(\?|$)/, { timeout: 15_000 })
    } finally {
      log('T16c-second', { ...second, patches: patchesTo('orders', id), url: page.url() })
    }
    expect(patchesTo('orders', id)).toBe(1)
  })

  test('T16d: in the customer edit Sheet, Submit pressed straight from a fixed Customer Code saves once', async ({ page }) => {
    const customer = await seed('customers', { company_name: 'Blur Test Co', customer_id: customerCode() })
    await open(page, `/nwind/customers/${customer.id}`, LONG)
    const sheet = page.getByRole('dialog')
    const code = sheet.locator('#customer_id')
    await expect(code).toBeVisible({ timeout: 30_000 })
    const layout = await barLayout(page)

    await emptyField(code)
    await page.keyboard.press('Tab')
    const errorAfterTab = await readError(page, 'customer_id')
    await code.click()
    await page.keyboard.type(customerCode())

    const result = await press(sheet.getByRole('button', { name: 'Submit', exact: true }))
    try {
      await expect(sheet, 'the Sheet closes').toHaveCount(0, { timeout: 15_000 })
    } finally {
      log('T16d', { layout, errorAfterTab, ...result, patches: patchesTo('customers', customer.id), url: page.url() })
    }
    expect({ patches: patchesTo('customers', customer.id), delta: result.delta }).toEqual({ patches: 1, delta: NO_MOVE })
  })

  test('T16e: in the short region edit Sheet, the error shows on leaving, then Submit pressed straight from the field saves once', async ({ page }) => {
    const region = await seed('regions', { region_description: 'Blur Test Region' })
    await open(page, `/nwind/regions/${region.id}`, LONG)
    const sheet = page.getByRole('dialog')
    const description = sheet.locator('#region_description')
    await expect(description).toBeVisible({ timeout: 30_000 })
    const layout = await barLayout(page)

    await emptyField(description)
    await page.keyboard.press('Tab')
    const errorAfterTab = await readError(page, 'region_description')
    const errorLines = await linesOf(page, 'region_description-error')
    try {
      await expect(errorOf(page, 'region_description'), 'error after leaving').toHaveText(MUST_NOT_BE_EMPTY)
    } finally {
      log('T16e-after-tab', { layout, errorAfterTab, errorLines })
    }

    await description.click()
    await page.keyboard.type('Blur Test Region Edited')
    const result = await press(sheet.getByRole('button', { name: 'Submit', exact: true }))
    try {
      await expect(sheet, 'the Sheet closes').toHaveCount(0, { timeout: 15_000 })
    } finally {
      log('T16e', { ...result, patches: patchesTo('regions', region.id), url: page.url() })
    }
    expect(patchesTo('regions', region.id)).toBe(1)
  })
})

test.describe('T17: the press and the error line (customers/new, tall)', () => {
  test('T17a: a press dragged off Submit saves nothing, and the error is shown after the release', async ({ page }) => {
    await open(page, CUSTOMERS_NEW, TALL)
    await expectUnpinned(page)
    await page.locator('#customer_id').click()

    await watchPress(submit(page))
    const box = (await submit(page).boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 100)
    await page.waitForTimeout(300)
    await page.mouse.up()
    try {
      await expect(errorOf(page, 'customer_id'), 'error within 1 s of the release').toHaveText(MUST_NOT_BE_EMPTY, { timeout: 1_000 })
    } finally {
      log('T17a', { ...(await readPress(page)), posts: saves!.posts, error: await readError(page, 'customer_id'), url: page.url() })
    }
    expect(saves!.posts).toBe(0)
  })

  test('T17b: clicking into another field shows the error after the click', async ({ page }) => {
    await open(page, CUSTOMERS_NEW, TALL)
    await expectUnpinned(page)
    await page.locator('#customer_id').click()

    await page.locator('#company_name').click()
    try {
      await expect(errorOf(page, 'customer_id'), 'error after the click').toHaveText(MUST_NOT_BE_EMPTY)
    } finally {
      log('T17b', { error: await readError(page, 'customer_id') })
    }
  })

  test('T17c: a 1.5 s press on Submit still saves once', async ({ page }) => {
    await open(page, CUSTOMERS_NEW, TALL)
    await expectUnpinned(page)
    await page.locator('#company_name').click()
    await page.keyboard.type('Blur Test Co')
    await page.locator('#customer_id').click()
    await page.keyboard.type(customerCode())

    await watchPress(submit(page))
    const box = (await submit(page).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(1500)
    await page.mouse.up()
    try {
      await expect(page).toHaveURL(/\/nwind\/customers(\?|$)/, { timeout: 15_000 })
    } finally {
      log('T17c', { ...(await readPress(page)), posts: saves!.posts, url: page.url() })
    }
    expect(saves!.posts).toBe(1)
  })
})

test.describe('T18: a value the server rejects, with each button (territories/new, tall)', () => {
  // territories has a child relation (Employee Territories) and a unique
  // constraint on its code: `territories_territory_id_unique` answers 409/23505
  // for a code that exists (measured with a direct POST).
  const TERRITORIES_NEW = '/nwind/territories/new'

  async function existingTerritoryCode(): Promise<string> {
    const res = await fetch(`${await apiBase()}/territories?select=territory_id&order=id&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const [row] = (await res.json()) as { territory_id: string }[]
    return row.territory_id
  }

  async function rejectedThenFixed(page: Page, button: () => Locator, id: string) {
    await open(page, TERRITORIES_NEW, TALL)
    await expectUnpinned(page)
    await page.locator('#territory_description').click()
    await page.keyboard.type('Blur Test Territory')
    await page.locator('#territory_id').click()
    await page.keyboard.type(await existingTerritoryCode())

    const first = await press(button())
    const footer = page.locator('form [data-slot=sticky-container]')
    await expect(footer.getByText('Error creating record'), 'server error in the footer').toBeVisible({ timeout: 15_000 })
    const firstState = { saves: saves!.created.length, posts: saves!.posts, path: new URL(page.url()).pathname }
    log(`${id}-first`, { ...first, ...firstState })
    expect({ saves: firstState.saves, path: firstState.path }).toEqual({ saves: 0, path: TERRITORIES_NEW })

    await emptyField(page.locator('#territory_id'))
    await page.keyboard.type(customerCode())
    return press(button())
  }

  test('T18: with Submit, the rejected save stays; the fixed one saves once and goes to the list', async ({ page }) => {
    const second = await rejectedThenFixed(page, () => submit(page), 'T18-submit')
    try {
      await expect(page).toHaveURL(/\/nwind\/territories(\?|$)/, { timeout: 15_000 })
    } finally {
      log('T18-submit-second', { ...second, saves: saves!.created.length, posts: saves!.posts, url: page.url() })
    }
    expect(saves!.created.length).toBe(1)
  })

  test('T18: with Employee Territories..., the rejected save stays; the fixed one saves once and goes to the child list', async ({ page }) => {
    const second = await rejectedThenFixed(page, () => childButton(page, 'Employee Territories...'), 'T18-child')
    let id: unknown
    try {
      id = await createdId()
      await expect(page).toHaveURL((url) =>
        url.pathname === '/nwind/employee_territories'
        && url.searchParams.get('_pf') === 'employee_territories.territory_id'
        && url.searchParams.get('_pv') === String(id), { timeout: 15_000 })
    } finally {
      log('T18-child-second', { ...second, saves: saves!.created.length, posts: saves!.posts, id, url: page.url() })
    }
    expect(saves!.created.length).toBe(1)
  })
})

test.describe('T19: customers/new on a phone (390x844, touch)', () => {
  const PHONE = { width: 390, height: 844 }
  test.use({ hasTouch: true, isMobile: true, viewport: PHONE })

  test('T19: as T11e, every press a tap', async ({ page }) => {
    await open(page, CUSTOMERS_NEW, PHONE)
    const layoutAtOpen = await barLayout(page)
    await page.locator('#company_name').tap()
    await page.keyboard.type('Blur Test Co')
    await page.keyboard.press('Tab')
    await expect(page.locator('#customer_id')).toBeFocused()
    await page.keyboard.press('Tab')
    const errorAfterTab = await readError(page, 'customer_id')
    await page.locator('#customer_id').tap()
    await page.keyboard.type(customerCode())

    await submit(page).scrollIntoViewIfNeeded()
    const layoutAtPress = await barLayout(page)
    await watchPress(submit(page))
    await submit(page).tap()
    try {
      await expect(page).toHaveURL(/\/nwind\/customers(\?|$)/, { timeout: 15_000 })
    } finally {
      log('T19', { layoutAtOpen, layoutAtPress, errorAfterTab, ...(await readPress(page)), posts: saves!.posts, url: page.url() })
    }
    expect(saves!.posts).toBe(1)
  })

  test('T19b: a tap on Submit that makes the Customer Code error line appear still counts', async ({ page }) => {
    await open(page, CUSTOMERS_NEW, PHONE)
    await page.locator('#company_name').tap()
    await page.keyboard.type('Blur Test Co')
    // Focus the empty Customer Code; it has a description line, so its error
    // is added under it and the page gets longer.
    await page.locator('#customer_id').tap()
    await expect(page.locator('#customer_id')).toBeFocused()

    await submit(page).scrollIntoViewIfNeeded()
    const layoutAtPress = await barLayout(page)
    await watchPress(submit(page))
    // Where the page and the growing field are at the tap (observer only).
    await page.evaluate(() => {
      const scroll: Record<string, { scrollY: number; fieldTop: number }> = {}
      ;(window as unknown as { __scroll: typeof scroll }).__scroll = scroll
      for (const type of ['pointerdown', 'click']) {
        document.addEventListener(type, () => {
          scroll[type] = { scrollY: window.scrollY, fieldTop: document.getElementById('customer_id')!.getBoundingClientRect().top }
        }, true)
      }
    })
    await submit(page).tap()
    await page.waitForTimeout(400)
    const record = await readPress(page)
    const error = await readError(page, 'customer_id')
    const scroll = await page.evaluate(() => (window as unknown as { __scroll: unknown }).__scroll)
    log('T19b', { layoutAtPress, ...record, scroll, error, posts: saves!.posts, url: page.url() })
    expect({ submits: record.submits, error, touchDelta: record.touchDelta }).toEqual({
      submits: 1,
      error: expect.stringMatching(MUST_NOT_BE_EMPTY),
      touchDelta: NO_MOVE,
    })
  })
})

test('T21: on orders/new (1280x800), every control Tab reaches is fully visible', async ({ page }) => {
  await open(page, ORDERS_NEW, LONG)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  // The last tab stop before the form: the header's child button.
  await childButton(page, 'Order Details...').focus()

  type Stop = { name: string; top: number; bottom: number; footerTop: number; innerHeight: number }
  const stops: Stop[] = []
  let end = ''
  try {
    for (let i = 0; i < 100; i++) {
      await page.keyboard.press('Tab')
      const stop = await page.evaluate((): Stop | string => {
        const el = document.activeElement as HTMLElement | null
        const form = document.getElementById('standalone-record-form')
        const footer = form?.querySelector('[data-slot=sticky-container]')
        if (!el || !form || !footer || !form.contains(el)) return 'left the form'
        if (footer.contains(el)) return 'reached the footer'
        const r = el.getBoundingClientRect()
        return {
          name: el.id || el.getAttribute('aria-label') || el.tagName.toLowerCase(),
          top: r.top,
          bottom: r.bottom,
          footerTop: footer.getBoundingClientRect().top,
          innerHeight: window.innerHeight,
        }
      })
      if (typeof stop === 'string') {
        end = stop
        break
      }
      stops.push(stop)
    }
  } finally {
    const failures = stops.filter((s) => s.bottom > s.footerTop || s.top < 0)
    log('T21', { end, count: stops.length, failures, belowWindow: stops.filter((s) => s.bottom > s.innerHeight).map((s) => s.name) })
  }
  expect(stops.length).toBeGreaterThan(0)
  for (const s of stops) {
    expect(s.bottom, `${s.name}: bottom at or above the footer`).toBeLessThanOrEqual(s.footerTop)
    expect(s.top, `${s.name}: top at or below the window top`).toBeGreaterThanOrEqual(0)
  }
})

test('T22: on the orders grid, one click on a row link with the filter popup open closes it and opens the record', async ({ page }) => {
  saves = trackSaves(page)
  await page.setViewportSize(LONG)
  await page.goto(`/nwind/orders#jwt=${token}`)
  await expect(page.locator('tbody a[href*="/nwind/orders/"]').first()).toBeVisible({ timeout: 30_000 })

  // The grid's only filter popup: the toolbar's Filter menu.
  await page.getByRole('button', { name: 'Filter', exact: true }).click()
  const popup = page.locator('[data-slot=popover-content]')
  await expect(popup).toBeVisible({ timeout: 10_000 })
  const inert = await isRootInert(page)

  // A row link the popup does not cover.
  const target = await page.evaluate(() => {
    const p = document.querySelector('[data-slot=popover-content]')!.getBoundingClientRect()
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('tbody a[href*="/nwind/orders/"]'))) {
      const r = a.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      const covered = x >= p.left && x <= p.right && y >= p.top && y <= p.bottom
      if (!covered && y > 0 && y < window.innerHeight) return { href: a.getAttribute('href')!, x, y }
    }
    return null
  })
  expect(target, 'a row link outside the popup').not.toBeNull()

  await page.mouse.click(target!.x, target!.y)
  try {
    await expect(popup, 'the popup closes').toHaveCount(0, { timeout: 5_000 })
    await expect(page, 'the record opens').toHaveURL((url) => url.pathname === target!.href.split('?')[0], { timeout: 10_000 })
  } finally {
    log('T22', { rootInertWhileOpen: inert, href: target?.href, popupOpen: await popup.count(), url: page.url() })
  }
})

// --- F3 acceptance --------------------------------------------------------------

test('F3: no horizontal page scrollbar', async ({ page }) => {
  test.setTimeout(240_000)
  const PAGES = ['/nwind', '/nwind/orders', '/nwind/orders/new', '/admin/roles']
  const pages: { width: number; path: string; scrollWidth: number; innerWidth: number }[] = []
  const grids: { width: number; scrollWidth: number; clientWidth: number; scrollLeftAfter: number }[] = []

  /** The page has drawn what it is for, so its width is final. */
  async function ready(path: string) {
    if (path === '/nwind/orders/new') await expect(submit(page)).toBeVisible({ timeout: 30_000 })
    else if (path === '/nwind') await expect(page.locator('#main-content h1').first()).toBeVisible({ timeout: 30_000 })
    else await expect(page.locator('tbody a').first()).toBeVisible({ timeout: 30_000 })
    await page.waitForLoadState('networkidle')
  }

  try {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 })
      for (const path of PAGES) {
        await page.goto(`${path}#jwt=${token}`)
        await ready(path)
        pages.push({
          width,
          path,
          ...(await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))),
        })
      }

      // The orders grid scrolls sideways inside its own container.
      await page.goto(`/nwind/orders#jwt=${token}`)
      await ready('/nwind/orders')
      grids.push({
        width,
        ...(await page.evaluate(() => {
          let scroller: HTMLElement | null = document.querySelector('table')
          while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement
          if (!scroller) return { scrollWidth: 0, clientWidth: 0, scrollLeftAfter: -1 }
          scroller.scrollLeft = 100
          return { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth, scrollLeftAfter: scroller.scrollLeft }
        })),
      })
    }
  } finally {
    log('F3', { pages, grids })
  }

  for (const p of pages) {
    expect(p.scrollWidth, `${p.path} at ${p.width}: no horizontal page scroll`).toBeLessThanOrEqual(p.innerWidth)
  }
  for (const g of grids) {
    expect(g.scrollLeftAfter, `grid scroll container found at ${g.width}`).not.toBe(-1)
    // Wherever the grid is wider than its container, the container scrolls.
    if (g.scrollWidth > g.clientWidth) expect(g.scrollLeftAfter, `grid scrolls sideways at ${g.width}`).toBeGreaterThan(0)
  }
  expect(grids.find((g) => g.width === 390)!.scrollWidth, 'at 390 the grid is wider than its container').toBeGreaterThan(grids.find((g) => g.width === 390)!.clientWidth)
})
