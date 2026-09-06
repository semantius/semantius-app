import { describe, it, expect } from 'vitest'
import {
  CALL_RETRYABLE,
  MAX_ATTEMPTS,
  MAX_ELAPSED_MS,
  READ_RETRYABLE,
  isDefinitiveNotFound,
  isTransientStatus,
  isUnder,
  parseRetryAfter,
  retryDelayMs,
  retryPolicyFor,
  statusOf,
  withRetry,
} from './retry'

/**
 * The retry policy, on its own.
 *
 * It is a pure function of a status, an attempt number, a header and a clock,
 * so it is tested here — in `node`, with no browser and no server — and the
 * integration (that the fetch interceptor really applies it, per request
 * shape, against real endpoints, and that the user sees nothing) is proven in
 * `e2e/transient-failures.spec.ts`, which counts the attempts each shape makes.
 *
 * Nothing is replaced here. `withRetry` is the loop over a `send()` the caller
 * supplies, so these tests hand it a plain function returning real `Response`
 * objects — no `fetch`, no server. `sleep` and `now` are options for the same
 * reason: a test must not spend real seconds waiting out a backoff, and handing
 * the function a recorder that also advances a virtual clock lets the delays it
 * ASKS for — and the budget they run into — be asserted as values.
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

describe('isDefinitiveNotFound', () => {
  it("recognizes PostgREST's own 404 by the code in its body", async () => {
    // What the tenant really answers for a table that is not in `entities`.
    const res = new Response(
      '{"code":"42P01","message":"Table \\"x\\" not found in entities","details":null,"hint":null}',
      { status: 404, headers: { 'content-type': 'application/json' } },
    )
    expect(await isDefinitiveNotFound(res)).toBe(true)
  })

  it('treats a 404 without that body as a cold start', async () => {
    expect(await isDefinitiveNotFound(new Response('', { status: 404 }))).toBe(false)
    expect(await isDefinitiveNotFound(new Response('<html>not found</html>', { status: 404 }))).toBe(false)
    expect(await isDefinitiveNotFound(new Response('{"message":"no code here"}', { status: 404 }))).toBe(false)
  })

  it('leaves the body readable for the caller', async () => {
    const res = new Response('{"code":"PGRST205"}', { status: 404 })
    await isDefinitiveNotFound(res)
    expect(await res.json()).toEqual({ code: 'PGRST205' })
  })

  it('is only about 404s', async () => {
    expect(await isDefinitiveNotFound(new Response('{"code":"X"}', { status: 500 }))).toBe(false)
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

  it('caps the backoff window', () => {
    for (let i = 0; i < 50; i++) expect(retryDelayMs(20)).toBeLessThan(5000)
  })

  it('lets the server decide when it says so', () => {
    expect(retryDelayMs(0, '2')).toBe(2000)
  })

  it('does NOT clamp what the server asks for — that is the budget’s call', () => {
    // Shortening a Retry-After is a request the server said not to make yet.
    // Whether the wait fits is decided in withRetry, against the elapsed budget.
    expect(retryDelayMs(0, '3600')).toBe(3_600_000)
  })
})

describe('isUnder', () => {
  it('matches the base itself and paths beneath it', () => {
    const base = 'https://api.example.com/rest/v1'
    expect(isUnder(base, base)).toBe(true)
    expect(isUnder(`${base}/customers?limit=1`, base)).toBe(true)
    expect(isUnder(`${base}?x=1`, `${base}/`)).toBe(true)
  })

  it('does not match by string prefix', () => {
    expect(isUnder('/apix/customers', '/api')).toBe(false)
    expect(isUnder('https://api.example.com/rest/v10/x', 'https://api.example.com/rest/v1')).toBe(false)
  })

  it('is false with no base', () => {
    expect(isUnder('/anything', undefined)).toBe(false)
    expect(isUnder('/anything', '')).toBe(false)
  })
})

describe('retryPolicyFor — the exceptions, by method and URL', () => {
  const API = 'https://tenant.example.com/rest/v1'
  const shape = (url: string, method: string, apiBaseUrl: string | undefined = API) => ({
    url,
    method,
    apiBaseUrl,
    replayable: true,
  })

  it('retries a read anywhere, and treats a 404 as a cold start only under the API', () => {
    const underApi = retryPolicyFor(shape(`${API}/customers?limit=10`, 'GET'))
    expect(underApi).toEqual({ statuses: READ_RETRYABLE, retryNotFound: true, retryNetworkError: true })

    const elsewhere = retryPolicyFor(shape('https://idp.example.com/userinfo', 'get'))
    expect(elsewhere).toEqual({ statuses: READ_RETRYABLE, retryNotFound: false, retryNetworkError: true })

    // Boot: the config has not resolved, so nothing is "under the API" yet.
    const boot = retryPolicyFor(shape('https://api.semantius.cloud/organization/x', 'GET', undefined))
    expect(boot).toEqual({ statuses: READ_RETRYABLE, retryNotFound: false, retryNetworkError: true })
  })

  it('retries a PostgREST function call only on an answer given before running it', () => {
    const call = retryPolicyFor(shape(`${API}/rpc/get_schema`, 'POST'))
    expect(call).toEqual({ statuses: CALL_RETRYABLE, retryNotFound: true, retryNetworkError: false })
    // A 500 or a 504 may have run the function; a network error may have too.
    expect(CALL_RETRYABLE.has(500)).toBe(false)
    expect(CALL_RETRYABLE.has(504)).toBe(false)
    expect(CALL_RETRYABLE.has(408)).toBe(false)
  })

  it('never retries a table write', () => {
    expect(retryPolicyFor(shape(`${API}/customers`, 'POST'))).toBeNull()
    expect(retryPolicyFor(shape(`${API}/customers?id=eq.1`, 'PATCH'))).toBeNull()
    expect(retryPolicyFor(shape(`${API}/customers?id=eq.1`, 'DELETE'))).toBeNull()
    expect(retryPolicyFor(shape(`${API}/customers?id=eq.1`, 'PUT'))).toBeNull()
  })

  it('does not mistake a table named like the rpc prefix, or a POST elsewhere, for a call', () => {
    expect(retryPolicyFor(shape(`${API}/rpc`, 'POST'))).toBeNull()
    expect(retryPolicyFor(shape('https://idp.example.com/rpc/x', 'POST'))).toBeNull()
    expect(retryPolicyFor(shape('https://idp.example.com/logout', 'POST'))).toBeNull()
  })

  it('never retries what cannot be sent twice', () => {
    expect(retryPolicyFor({ ...shape(`${API}/customers`, 'GET'), replayable: false })).toBeNull()
  })
})

describe('statusOf', () => {
  it('reads the status a thrower attached to cause', () => {
    expect(statusOf(new Error('x', { cause: { status: 429 } }))).toBe(429)
    expect(statusOf(new Error('x', { cause: { statusCode: 503 } }))).toBe(503)
  })

  it('answers undefined when it cannot tell — never a guess', () => {
    expect(statusOf(new Error('bare'))).toBeUndefined()
    expect(statusOf(new Error('x', { cause: 'text' }))).toBeUndefined()
    expect(statusOf('not an error')).toBeUndefined()
  })
})

describe('withRetry', () => {
  /**
   * Records the delays asked for and advances a virtual clock by them, so
   * backoff AND budget are asserted rather than waited out.
   */
  function clock() {
    const waited: number[] = []
    let t = 1_000_000
    return {
      waited,
      now: () => t,
      sleep: async (ms: number) => {
        waited.push(ms)
        t += ms
      },
    }
  }

  /** A server that answers with the given statuses in order, then 200 forever. */
  function serving(...statuses: (number | [number, Record<string, string>, string?])[]) {
    const calls = { count: 0 }
    const send = () => {
      const next = statuses[calls.count]
      calls.count++
      if (next === undefined) return Promise.resolve(new Response('{}', { status: 200 }))
      const [status, headers, body] = Array.isArray(next) ? next : [next, {}, undefined]
      return Promise.resolve(new Response(body ?? '{}', { status, headers }))
    }
    return { send, calls }
  }

  it('returns the first success without waiting', async () => {
    const { waited, sleep, now } = clock()
    const { send, calls } = serving()

    const res = await withRetry(send, { sleep, now })

    expect(res.status).toBe(200)
    expect(calls.count).toBe(1)
    expect(waited).toEqual([])
  })

  it('retries a transient failure and returns the success that follows', async () => {
    const { waited, sleep, now } = clock()
    const { send, calls } = serving(
      [429, { 'retry-after': '1' }],
      [429, { 'retry-after': '1' }],
    )

    const res = await withRetry(send, { sleep, now })

    expect(res.status).toBe(200)
    expect(calls.count).toBe(3)
    // Both waits honored the server's own header rather than the backoff.
    expect(waited).toEqual([1000, 1000])
  })

  it('gives up after a bounded number of attempts, handing back the last response', async () => {
    const { waited, sleep, now } = clock()
    const { send, calls } = serving(...Array<number>(MAX_ATTEMPTS).fill(503))

    const res = await withRetry(send, { sleep, now })

    // The caller's existing error handling runs on this, unchanged — just later.
    expect(res.status).toBe(503)
    expect(calls.count).toBe(MAX_ATTEMPTS)
    expect(waited).toHaveLength(MAX_ATTEMPTS - 1)
  })

  it('obeys a Retry-After that fits the budget, in full', async () => {
    const { waited, sleep, now } = clock()
    const { send, calls } = serving([429, { 'retry-after': '8' }])

    const res = await withRetry(send, { sleep, now })

    expect(res.status).toBe(200)
    expect(calls.count).toBe(2)
    expect(waited).toEqual([8000])
  })

  it('ends the attempt, rather than clamping, when Retry-After does not fit the budget', async () => {
    const { waited, sleep, now } = clock()
    const { send, calls } = serving([429, { 'retry-after': '30' }])

    const res = await withRetry(send, { sleep, now })

    // Thirty seconds is the server telling us to give up. The 429 goes back to
    // the caller at once, and no request is made before the server said so.
    expect(res.status).toBe(429)
    expect(calls.count).toBe(1)
    expect(waited).toEqual([])
  })

  it('spends the elapsed budget, not just the attempt count', async () => {
    const { waited, sleep, now } = clock()
    // Each answer asks for 4s: two fit in ten seconds, the third would not.
    const { send, calls } = serving(
      [503, { 'retry-after': '4' }],
      [503, { 'retry-after': '4' }],
      [503, { 'retry-after': '4' }],
      [503, { 'retry-after': '4' }],
    )

    const res = await withRetry(send, { sleep, now })

    expect(res.status).toBe(503)
    expect(calls.count).toBe(3)
    expect(waited).toEqual([4000, 4000])
    expect(waited.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(MAX_ELAPSED_MS)
  })

  it('does not retry a refusal', async () => {
    const { sleep, now } = clock()
    const { send, calls } = serving(403)

    const res = await withRetry(send, { sleep, now })

    expect(res.status).toBe(403)
    expect(calls.count).toBe(1)
  })

  it('retries a bare 404 only when the caller says a cold start can produce one', async () => {
    const { sleep, now } = clock()

    const plain = serving(404)
    expect((await withRetry(plain.send, { sleep, now })).status).toBe(404)
    expect(plain.calls.count).toBe(1)

    const cold = serving(404)
    expect((await withRetry(cold.send, { sleep, now, retryNotFound: true })).status).toBe(200)
    expect(cold.calls.count).toBe(2)
  })

  it("does not retry PostgREST's own 404 even where a cold start is possible", async () => {
    const { sleep, now } = clock()
    const { send, calls } = serving([404, { 'content-type': 'application/json' }, '{"code":"PGRST205","message":"no such table"}'])

    const res = await withRetry(send, { sleep, now, retryNotFound: true })

    expect(res.status).toBe(404)
    expect(calls.count).toBe(1)
    // And the caller can still read the body the server sent.
    expect(await res.json()).toMatchObject({ code: 'PGRST205' })
  })

  it('honors a narrower status set', async () => {
    const { sleep, now } = clock()
    const { send, calls } = serving(500)

    const res = await withRetry(send, { sleep, now, statuses: CALL_RETRYABLE })

    expect(res.status).toBe(500)
    expect(calls.count).toBe(1)
  })

  it('retries a network error, and rethrows the last one', async () => {
    const { waited, sleep, now } = clock()
    let count = 0
    const send = () => {
      count++
      return Promise.reject(new TypeError('Failed to fetch'))
    }

    await expect(withRetry(send, { sleep, now })).rejects.toThrow('Failed to fetch')
    expect(count).toBe(MAX_ATTEMPTS)
    expect(waited).toHaveLength(MAX_ATTEMPTS - 1)
  })

  it('does not retry a network error when the request may have run', async () => {
    const { sleep, now } = clock()
    let count = 0
    const send = () => {
      count++
      return Promise.reject(new TypeError('Failed to fetch'))
    }

    await expect(withRetry(send, { sleep, now, retryNetworkError: false })).rejects.toThrow()
    expect(count).toBe(1)
  })

  it('rethrows an abort at once — it is not a network error', async () => {
    const { sleep, now } = clock()
    let count = 0
    const send = () => {
      count++
      return Promise.reject(new DOMException('The user aborted a request.', 'AbortError'))
    }

    await expect(withRetry(send, { sleep, now })).rejects.toThrow('aborted')
    expect(count).toBe(1)
  })

  it('honors an attempt budget the caller sets', async () => {
    const { sleep, now } = clock()
    const { send, calls } = serving(...Array<number>(10).fill(429))

    await withRetry(send, { sleep, now, attempts: 2 })

    expect(calls.count).toBe(2)
  })
})
