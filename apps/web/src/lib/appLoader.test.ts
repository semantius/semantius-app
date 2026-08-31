import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { hideAppLoader } from './appLoader'

/**
 * The boot overlay is the only thing standing between the user and an infinite
 * spinner (see the hang invariant in CONTEXT-MEMORY.md), and hideAppLoader() is
 * the only thing that takes it down. These tests pin the two properties callers
 * depend on: it stops blocking input immediately, and it always reaches the
 * terminal `hidden` state — including where `transitionend` never fires.
 */
describe('hideAppLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="app-loader"></div>'
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  const loader = () => document.getElementById('app-loader')!

  it('stops blocking input and starts the fade immediately, without hiding yet', () => {
    hideAppLoader()

    const el = loader()
    expect(el.style.pointerEvents).toBe('none')
    expect(el.style.opacity).toBe('0')
    // Still in the DOM and visible — the crossfade needs it painted.
    expect(el.hidden).toBe(false)
  })

  it('hides once the fade transition ends', () => {
    hideAppLoader()
    expect(loader().hidden).toBe(false)

    loader().dispatchEvent(new Event('transitionend'))
    expect(loader().hidden).toBe(true)
  })

  it('hides via the timeout fallback when no transitionend arrives', () => {
    hideAppLoader()
    expect(loader().hidden).toBe(false)

    vi.advanceTimersByTime(299)
    expect(loader().hidden).toBe(false)

    vi.advanceTimersByTime(1)
    expect(loader().hidden).toBe(true)
  })

  it('is idempotent — repeat calls do not restart the fade', () => {
    hideAppLoader()
    loader().dispatchEvent(new Event('transitionend'))
    expect(loader().hidden).toBe(true)

    // A second call (render-phase call sites, StrictMode double effects) must
    // not un-hide the overlay or re-arm the transition.
    hideAppLoader()
    expect(loader().hidden).toBe(true)

    vi.advanceTimersByTime(1000)
    expect(loader().hidden).toBe(true)
  })

  it('does not throw when the overlay element is absent', () => {
    document.body.innerHTML = ''
    expect(() => hideAppLoader()).not.toThrow()
  })
})
