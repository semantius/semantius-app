import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { hideAppLoader } from './appLoader'

/**
 * The boot overlay is the only thing standing between the user and an infinite
 * spinner (see the hang invariant in CONTEXT-MEMORY.md), and hideAppLoader() is
 * the only thing that takes it down. These tests pin the two properties callers
 * depend on: it stops blocking input immediately, and it always reaches the
 * terminal `hidden` state — including where `transitionend` never fires.
 *
 * ON THE FIXTURE. These run in a real Chromium, so the clock is real and so is
 * `transitionend`: an element given a real CSS transition fires the real event,
 * and one given none falls through to the real 300 ms timer, waited out for
 * real. What is still hand-built is the element itself — Vitest's tester page is
 * an empty document, not `index.html`.
 *
 * That stand-in is deliberate and is frozen in `src/test/substitutions.test.ts`
 * rather than pretended away. The alternative — pointing the browser project's
 * `testerHtmlPath` at a copy of `index.html` — is worse twice over: it would add
 * a THIRD copy of the overlay markup to keep in sync (index.html already
 * duplicates tokens from global.css), and it would put a full-screen overlay on
 * top of every other test in the project, swallowing their clicks exactly the
 * way it swallowed /form-playground's.
 *
 * What the fixture cannot prove — that the element in `index.html` is the one
 * this function finds — is covered for real by `e2e/login-journey.spec.ts`,
 * which waits for the actual overlay on the actual page to go hidden.
 */
describe('hideAppLoader', () => {
  /**
   * `transitioning: false` gives an element with no transition at all, which is
   * what reduced-motion, a hidden tab and a display:none subtree amount to: the
   * browser fires no `transitionend` and only the timeout can finish the job.
   */
  function mountOverlay({ transitioning = true } = {}) {
    const el = document.createElement('div')
    el.id = 'app-loader'
    el.style.opacity = '1'
    if (transitioning) el.style.transition = 'opacity 180ms linear'
    document.body.appendChild(el)
    // Force a style flush so the browser has a "from" value to transition FROM;
    // without it the opacity change coalesces into the initial paint and no
    // transition — and so no transitionend — ever runs.
    void el.offsetHeight
    return el
  }

  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('stops blocking input and starts the fade immediately, without hiding yet', () => {
    const el = mountOverlay()

    hideAppLoader()

    expect(el.style.pointerEvents).toBe('none')
    expect(el.style.opacity).toBe('0')
    // Still in the DOM and visible — the crossfade needs it painted.
    expect(el.hidden).toBe(false)
  })

  it('hides once the fade transition ends', async () => {
    const el = mountOverlay()
    let ended = false
    el.addEventListener('transitionend', () => { ended = true }, { once: true })

    hideAppLoader()
    expect(el.hidden).toBe(false)

    // Polled, not awaited on the event: listeners for one dispatch run in
    // registration order and a microtask checkpoint falls between them, so
    // resuming from an `await` on the first listener would assert before
    // hideAppLoader's own listener had run.
    await expect.poll(() => el.hidden, { timeout: 250 }).toBe(true)
    // The transition really ran — this is not the 300ms fallback in disguise.
    expect(ended).toBe(true)
  })

  it('hides via the timeout fallback when no transitionend arrives', async () => {
    const el = mountOverlay({ transitioning: false })

    hideAppLoader()
    expect(el.hidden).toBe(false)

    await new Promise((r) => setTimeout(r, 400))
    expect(el.hidden).toBe(true)
  })

  it('is idempotent — repeat calls do not restart the fade', async () => {
    const el = mountOverlay({ transitioning: false })

    hideAppLoader()
    await new Promise((r) => setTimeout(r, 400))
    expect(el.hidden).toBe(true)

    // A second call (render-phase call sites, StrictMode double effects) must
    // not un-hide the overlay or re-arm the transition.
    hideAppLoader()
    expect(el.hidden).toBe(true)

    await new Promise((r) => setTimeout(r, 400))
    expect(el.hidden).toBe(true)
  })

  it('does not throw when the overlay element is absent', () => {
    expect(() => hideAppLoader()).not.toThrow()
  })
})
