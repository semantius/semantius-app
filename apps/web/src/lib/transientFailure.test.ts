import { describe, it, expect } from 'vitest'
import {
  MAX_ATTEMPTS,
  isTransientStatus,
  parseRetryAfter,
  retryDelayMs,
  withRetry,
} from './transientFailure'

/**
 * The retry policy, on its own.
 *
 * It is a pure function of a status, an attempt number and a header, so it is
 * tested here — in `node`, with no browser and no server — and the integration
 * (that `AuthContext` actually uses it, against real endpoints, and that the
 * user sees nothing) is proven in `e2e/transient-failures.spec.ts`.
 *
 * Nothing is replaced here. `withRetry` is the loop over a `send()` the caller
 * supplies, so these tests hand it a plain function returning real `Response`
 * objects — no `fetch`, no server, no clock. `sleep` is an option for the same
 * reason: a test must not spend real seconds waiting out a backoff, and handing
 * the function a different continuation lets the delays it ASKS for be asserted
 * as values. `fetchWithRetry` is `withRetry(() => fetch(...))` and is proven
 * against real endpoints in `e2e/transient-failures.spec.ts`.
 */

describe('isTransientStatus', () => {
  it('retries the statuses that mean "not now"', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      expect(isTransientStatus(status), `${status} should be retried`).toBe(true)
    }
  })

  it('does not retry a request the server understood and refused', () => {
    // Repeating any of these arrives at the same answer, slower.
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(isTransientStatus(status), `${status} should not be retried`).toBe(false)
    }
  })

  it('retries a 404 only where a cold start can produce one', () => {
    expect(isTransientStatus(404)).toBe(false)
    expect(isTransientStatus(404, true)).toBe(true)
    // The opt-in does not widen anything else.
    expect(isTransientStatus(403, true)).toBe(false)
  })
})

describe('parseRetryAfter', () => {
  it('reads delay-seconds', () => {
    expect(parseRetryAfter('2')).toBe(2000)
    expect(parseRetryAfter(' 30 ')).toBe(30_000)
    expect(parseRetryAfter('0')).toBe(0)
  })

  it('reads an HTTP date, relative to now', () => {
    const now = Date.parse('2026-09-06T10:00:00Z')
    expect(parseRetryAfter('Sun, 06 Sep 2026 10:00:05 GMT', now)).toBe(5000)
  })

  it('never returns a negative delay for a date already past', () => {
    const now = Date.parse('2026-09-06T10:00:00Z')
    // A retry "in the past" must not become an immediate hot loop.
    expect(parseRetryAfter('Sun, 06 Sep 2026 09:59:00 GMT', now)).toBe(0)
  })

  it('ignores what it cannot read', () => {
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter('')).toBeNull()
    expect(parseRetryAfter('   ')).toBeNull()
    expect(parseRetryAfter('soon')).toBeNull()
    // Signed and fractional forms are not delay-seconds per the spec.
    expect(parseRetryAfter('-5')).toBeNull()
    expect(parseRetryAfter('1.5')).toBeNull()
  })
})

describe('retryDelayMs', () => {
  it('backs off exponentially, with full jitter', () => {
    // Full jitter means a point in [0, window), not the window itself: clients
    // that failed together must not retry together.
    for (const [attempt, window] of [
      [0, 300],
      [1, 600],
      [2, 1200],
    ] as const) {
      for (let i = 0; i < 50; i++) {
        const delay = retryDelayMs(attempt)
        expect(delay).toBeGreaterThanOrEqual(0)
        expect(delay).toBeLessThan(window)
      }
    }
  })

  it('caps the backoff', () => {
    for (let i = 0; i < 50; i++) expect(retryDelayMs(20)).toBeLessThan(5000)
  })

  it('lets the server decide when it says so', () => {
    expect(retryDelayMs(0, '2')).toBe(2000)
  })

  it('caps even what the server asks for', () => {
    // An hour is the server telling us to give up, not to hang.
    expect(retryDelayMs(0, '3600')).toBe(5000)
  })
})

describe('withRetry', () => {
  /** Records the delays asked for, so backoff is asserted rather than waited. */
  function recorder() {
    const waited: number[] = []
    return {
      waited,
      sleep: async (ms: number) => {
        waited.push(ms)
      },
    }
  }

  /** A server that answers with the given statuses in order, then 200 forever. */
  function serving(...statuses: (number | [number, Record<string, string>])[]) {
    const calls = { count: 0 }
    const send = () => {
      const next = statuses[calls.count]
      calls.count++
      if (next === undefined) return Promise.resolve(new Response('{}', { status: 200 }))
      const [status, headers] = Array.isArray(next) ? next : [next, {}]
      return Promise.resolve(new Response('{}', { status, headers }))
    }
    return { send, calls }
  }

  it('returns the first success without waiting', async () => {
    const { waited, sleep } = recorder()
    const { send, calls } = serving()

    const res = await withRetry(send, { sleep })

    expect(res.status).toBe(200)
    expect(calls.count).toBe(1)
    expect(waited).toEqual([])
  })

  it('retries a transient failure and returns the success that follows', async () => {
    const { waited, sleep } = recorder()
    const { send, calls } = serving(
      [429, { 'retry-after': '1' }],
      [429, { 'retry-after': '1' }],
    )

    const res = await withRetry(send, { sleep })

    expect(res.status).toBe(200)
    expect(calls.count).toBe(3)
    // Both waits honored the server's own header rather than the backoff.
    expect(waited).toEqual([1000, 1000])
  })

  it('gives up after a bounded number of attempts, handing back the last response', async () => {
    const { waited, sleep } = recorder()
    const { send, calls } = serving(...Array<number>(MAX_ATTEMPTS).fill(503))

    const res = await withRetry(send, { sleep })

    // The caller's existing error handling runs on this, unchanged — just later.
    expect(res.status).toBe(503)
    expect(calls.count).toBe(MAX_ATTEMPTS)
    expect(waited).toHaveLength(MAX_ATTEMPTS - 1)
  })

  it('does not retry a refusal', async () => {
    const { sleep } = recorder()
    const { send, calls } = serving(403)

    const res = await withRetry(send, { sleep })

    expect(res.status).toBe(403)
    expect(calls.count).toBe(1)
  })

  it('retries a 404 only when the caller says a cold start can produce one', async () => {
    const { sleep } = recorder()

    const plain = serving(404)
    expect((await withRetry(plain.send, { sleep })).status).toBe(404)
    expect(plain.calls.count).toBe(1)

    const cold = serving(404)
    expect((await withRetry(cold.send, { sleep, coldStart404: true })).status).toBe(200)
    expect(cold.calls.count).toBe(2)
  })

  it('retries a network error, and rethrows the last one', async () => {
    const { waited, sleep } = recorder()
    let count = 0
    const send = () => {
      count++
      return Promise.reject(new TypeError('Failed to fetch'))
    }

    await expect(withRetry(send, { sleep })).rejects.toThrow('Failed to fetch')
    expect(count).toBe(MAX_ATTEMPTS)
    expect(waited).toHaveLength(MAX_ATTEMPTS - 1)
  })

  it('honors an attempt budget the caller sets', async () => {
    const { sleep } = recorder()
    const { send, calls } = serving(...Array<number>(10).fill(429))

    await withRetry(send, { sleep, attempts: 2 })

    expect(calls.count).toBe(2)
  })
})
