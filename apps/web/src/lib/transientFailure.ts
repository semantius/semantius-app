/**
 * Retrying the failures that are not failures yet.
 *
 * WHY THIS EXISTS. Two of the endpoints the app cannot boot without answer
 * badly for reasons that have nothing to do with the request:
 *
 *   - the identity provider's `/userinfo` answers **429** when pages load a few
 *     seconds apart (observed nineteen times in one accessibility audit run);
 *   - the tenant's serverless PostgREST answers **404** to the first request
 *     after an idle period — a cold start, indistinguishable from a real 404 by
 *     status alone, and a reload fixes it.
 *
 * Both used to reach the user as a terminal error card. A rate limit and a cold
 * start are transient by definition; showing either as a hard failure is wrong.
 *
 * The policy is pure and lives here so it can be tested without a browser, a
 * server or a clock — `transientFailure.test.ts` in the `node` project — and so
 * every call site retries the same way.
 */

/**
 * Total attempts, INCLUDING the first. Bounded on purpose: an endpoint that is
 * really gone must still produce an error the user can see and act on, and an
 * unbounded retry against a rate limiter is how a client earns a longer ban.
 */
export const MAX_ATTEMPTS = 4

/** First backoff step. Doubles per attempt, jittered, capped by MAX_DELAY_MS. */
const BASE_DELAY_MS = 300
const MAX_DELAY_MS = 5_000

/**
 * Statuses worth trying again. Deliberately NOT 4xx in general: a 400, 401, 403
 * or 422 says the request was wrong, and repeating it wastes the user's time to
 * arrive at the same answer.
 *
 * `408` request timeout and `425` too-early are the client-side transients;
 * `500`, `502`, `503` and `504` are the server saying it could not, rather than
 * would not. `429` is the one this was written for.
 */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504])

/**
 * `404` is retryable ONLY where a cold start can produce one — the tenant's
 * serverless PostgREST. Everywhere else a 404 means the thing is not there and
 * retrying is just a slower way to say so, which is why this is opt-in per call
 * site (`coldStart404`) rather than folded into the set above.
 */
export const COLD_START_STATUS = 404

export function isTransientStatus(status: number, coldStart404 = false): boolean {
  if (coldStart404 && status === COLD_START_STATUS) return true
  return RETRYABLE.has(status)
}

/**
 * How long to wait before attempt `attempt` (0-based: 0 is the wait after the
 * FIRST failure).
 *
 * Exponential backoff with FULL jitter — a random point in [0, window) rather
 * than the window itself. Every client that fails at the same moment (a rate
 * limiter kicking in, a cold start) would otherwise retry at the same moment
 * too, and rebuild the spike it is backing off from.
 *
 * A `Retry-After` header wins when the server sends one, because the server
 * knows when it will be ready and we do not. Both its forms are accepted —
 * delay-seconds and an HTTP date — and the result is capped: a server asking
 * for an hour is telling us to give up, not to hang.
 */
export function retryDelayMs(
  attempt: number,
  retryAfter?: string | null,
  now: number = Date.now(),
): number {
  const fromHeader = parseRetryAfter(retryAfter, now)
  if (fromHeader !== null) return Math.min(fromHeader, MAX_DELAY_MS)

  const window = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
  return Math.random() * window
}

/** Milliseconds, or null when the header is absent or unparseable. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // delay-seconds is digits and nothing else. Every other numeric form — a sign,
  // a decimal point — is invalid per the spec, and must not fall through to
  // Date.parse, which reads `-5` as a year and would answer with a delay of
  // about two thousand years.
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  if (/^[+-]?\d*\.?\d+$/.test(trimmed)) return null

  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return null
  return Math.max(0, date - now)
}

/**
 * The same judgment, for an Error that has already been built from a failed
 * response — which is what TanStack Query's `retry` predicate is handed.
 *
 * Both shapes this app produces are read: `AuthContext.responseError()` puts
 * `{ status }` on `cause`, and the data hooks put the parsed PostgREST body
 * there with a `status` alongside it. A network error (a TypeError from
 * `fetch`, which has no response at all) is transient by nature and says so.
 */
export function isTransientError(err: unknown, coldStart404 = false): boolean {
  if (!(err instanceof Error)) return false
  const cause = err.cause
  if (typeof cause === 'object' && cause !== null) {
    const status = (cause as { status?: unknown; statusCode?: unknown }).status ??
      (cause as { statusCode?: unknown }).statusCode
    if (typeof status === 'number') return isTransientStatus(status, coldStart404)
  }
  // `fetch` rejects with a TypeError when the request never completed — offline,
  // DNS, a connection cut. There is no status to read, and trying again is
  // exactly right.
  return err instanceof TypeError
}

export interface RetryOptions {
  /** Total attempts including the first. Defaults to MAX_ATTEMPTS. */
  attempts?: number
  /** Treat a 404 as a cold start. Only for the serverless PostgREST. */
  coldStart404?: boolean
  /**
   * How to wait. Defaults to a real timer; a test passes a recorder so the
   * delays the policy asks for can be ASSERTED instead of spent.
   */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The policy itself, over any request function.
 *
 * Split from `fetchWithRetry` below so the loop — how many attempts, which
 * statuses, how long between them — is a pure function of a `send()` the caller
 * supplies. `transientFailure.test.ts` calls it with a plain function returning
 * real `Response` objects, which means the policy is tested without replacing
 * `fetch` and without a server.
 *
 * Returns the LAST response — it does not throw on a failing status, exactly
 * like `fetch` — so a caller's existing error handling is unchanged; it just
 * runs later, and only for a failure that survived the retries. A thrown network
 * error is retried too, and rethrown if the last attempt also throws.
 */
export async function withRetry(
  send: () => Promise<Response>,
  { attempts = MAX_ATTEMPTS, coldStart404 = false, sleep = defaultSleep }: RetryOptions = {},
): Promise<Response> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const isLast = attempt === attempts - 1
    try {
      const response = await send()
      if (response.ok || isLast || !isTransientStatus(response.status, coldStart404)) {
        return response
      }
      await sleep(retryDelayMs(attempt, response.headers.get('retry-after')))
    } catch (err) {
      // A network error — offline, DNS, a connection cut mid-flight. Transient
      // by nature, and the one case where there is no response to hand back.
      if (isLast) throw err
      await sleep(retryDelayMs(attempt))
    }
  }

  // Unreachable: the loop either returns or throws on its last iteration. Kept
  // so a future edit to the bounds cannot silently fall out with `undefined`.
  throw new Error('withRetry: exhausted attempts without a response')
}

/** `fetch`, with the policy above applied. */
export function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  return withRetry(() => fetch(input, init), options)
}
