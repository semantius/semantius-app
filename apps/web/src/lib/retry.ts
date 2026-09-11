/**
 * The retry policy. ONE file owns it; nothing else configures retrying.
 *
 * WHY THIS EXISTS. Two of the endpoints the app cannot boot without answer
 * badly for reasons that have nothing to do with the request:
 *
 *   - the identity provider's `/userinfo` answers **429** when pages load a few
 *     seconds apart (observed nineteen times in one accessibility audit run);
 *   - the tenant's serverless PostgREST answers **404** to the first request
 *     after an idle period — a cold start — and a reload fixes it.
 *
 * Both used to reach the user as a terminal error card, and one of them reached
 * the user as a 404 PAGE: the table route's loader turned every failure of
 * `get_schema` into "not found", so a rate limit told the user the table did
 * not exist. A rate limit and a cold start are transient by definition; showing
 * either as a hard failure is wrong.
 *
 * WHERE IT IS APPLIED. In the fetch interceptor (`lib/apiClient.ts`), which
 * every request in the app already passes through — vendor code included. That
 * is what makes "every request is retried, with the exceptions named in code"
 * true by construction: a new call site cannot forget it. `retryPolicyFor()` is
 * the classification, and the exceptions live there, by HTTP method and URL,
 * not by omission at a call site. TanStack Query's own retry is OFF
 * (`main.tsx`) so the two can never stack.
 *
 * The policy is pure and lives here so it can be tested without a browser, a
 * server or a clock — `retry.test.ts` in the `node` project — and so every
 * request retries the same way.
 */

/**
 * The budget is TOTAL ELAPSED TIME, not a count and not a per-wait cap. A rate
 * limiter that asks for eight seconds gets eight seconds; one that asks for
 * thirty ends the attempt immediately rather than being clamped to something
 * it did not say. ~10s is what a user tolerates behind a skeleton or a stale
 * grid before "still loading" becomes "broken".
 */
export const MAX_ELAPSED_MS = 10_000

/**
 * A ceiling on attempts within the budget, INCLUDING the first. Full jitter can
 * draw very short waits; without this, a bad ten seconds could mean a dozen
 * requests at a service that asked us to slow down. An endpoint that is really
 * gone must still produce an error the user can see and act on.
 */
export const MAX_ATTEMPTS = 6

/** First backoff window. Doubles per attempt, jittered, capped by MAX_DELAY_MS. */
export const BASE_DELAY_MS = 300
export const MAX_DELAY_MS = 5_000

/**
 * Statuses worth trying again for a READ. Deliberately NOT 4xx in general: a
 * 400, 401, 403 or 422 says the request was wrong, and repeating it wastes the
 * user's time to arrive at the same answer.
 *
 * `408` request timeout and `425` too-early are the client-side transients;
 * `500`, `502`, `503` and `504` are the server saying it could not, rather than
 * would not. `429` is the one this was written for.
 */
export const READ_RETRYABLE: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504])

/**
 * Statuses worth trying again for a PostgREST function CALL (`POST /rpc/…`) —
 * how this app reads `get_schema`, `get_userinfo` and everything behind
 * `useRpc`, but also how `useRpcMutation` writes. These are the answers a
 * server gives BEFORE running anything: a rate limit, a gateway that could not
 * reach the backend, a backend that is down or not ready. A `500` or `504` may
 * have run the function, a `408` may have too, and a network error mid-flight
 * certainly might — so none of those is repeated for a call, because a
 * repeated write is a duplicate.
 */
export const CALL_RETRYABLE: ReadonlySet<number> = new Set([425, 429, 502, 503])

/**
 * A 404 is retryable ONLY where a cold start can produce one — the tenant's
 * serverless PostgREST. Everywhere else a 404 means the thing is not there and
 * retrying is just a slower way to say so.
 *
 * And even there, PostgREST's OWN 404 is definitive: a table or function that
 * is not in the schema cache answers with a JSON body carrying a `code`
 * (`PGRST205`, `PGRST202`, `42P01`). The cold-start 404 comes from the layer in
 * front of a sleeping backend and carries no such body. Reading the body is
 * what keeps a genuinely missing table from costing ten seconds.
 */
export const COLD_START_STATUS = 404

export function isTransientStatus(status: number, retryNotFound = false): boolean {
  if (retryNotFound && status === COLD_START_STATUS) return true
  return READ_RETRYABLE.has(status)
}

/** A 404 whose body is PostgREST's error shape: the server that owns the table answered. */
export async function isDefinitiveNotFound(response: Response): Promise<boolean> {
  if (response.status !== COLD_START_STATUS) return false
  try {
    const body: unknown = await response.clone().json()
    return typeof body === 'object' && body !== null && typeof (body as { code?: unknown }).code === 'string'
  } catch {
    return false
  }
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
 * delay-seconds and an HTTP date. It is NOT capped here: whether the wait fits
 * is the budget's decision (`withRetry`), and a wait that does not fit ends the
 * attempt rather than being shortened into a request the server said not to
 * make yet.
 *
 * SERVER-SIDE CONTRACT: `Retry-After` is not a CORS-safelisted response header,
 * and the API and the identity provider are cross-origin, so the browser hides
 * it from `headers.get()` unless the server also sends
 * `Access-Control-Expose-Headers: Retry-After`. A server that omits that gets
 * the jittered backoff below instead — the header is simply invisible here, and
 * nothing in this file can change that.
 */
export function retryDelayMs(
  attempt: number,
  retryAfter?: string | null,
  now: number = Date.now(),
): number {
  const fromHeader = parseRetryAfter(retryAfter, now)
  if (fromHeader !== null) return fromHeader

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

export interface RetryPolicy {
  /** Statuses that are repeated. */
  statuses: ReadonlySet<number>
  /** Treat a bare 404 as a cold start (see COLD_START_STATUS). */
  retryNotFound: boolean
  /**
   * Repeat a request that never got an answer — offline, DNS, a connection cut.
   * True for a read; false for anything that may have run on the server.
   */
  retryNetworkError: boolean
}

/** What `retryPolicyFor` needs to know about a request. */
export interface RequestShape {
  /** The URL as it will be sent (relative ones already resolved). */
  url: string
  method: string
  /**
   * The tenant's API base, when the config has resolved. Only requests under it
   * can be a cold start, and only its `/rpc/` calls are calls.
   */
  apiBaseUrl?: string
  /**
   * Whether the request can be sent twice at all. A body that is a stream (or a
   * `Request` whose body has been read) cannot be replayed, and a retry would
   * only fail differently.
   */
  replayable: boolean
}

/** `url` is `base` or lies beneath it — by path, not by string prefix (`/api` ≠ `/apix`). */
export function isUnder(url: string, base: string | undefined): boolean {
  if (!base) return false
  const cleanBase = base.replace(/\/+$/, '')
  if (!cleanBase) return false
  return url === cleanBase || url.startsWith(cleanBase + '/') || url.startsWith(cleanBase + '?')
}

/**
 * The classification — which requests are retried, and how. This is the whole
 * list of exceptions, and it is by METHOD and URL so that a new call site is
 * covered (or excluded) without knowing this file exists.
 *
 * | Request                                   | Policy                              |
 * | ----------------------------------------- | ----------------------------------- |
 * | `GET` / `HEAD`, anywhere                  | reads: READ_RETRYABLE + network     |
 * |   … under the API base                    | + a bare 404 (cold start)           |
 * | `POST …/rpc/…` under the API base         | calls: CALL_RETRYABLE + a bare 404  |
 * | `POST` / `PATCH` / `PUT` / `DELETE` else  | never — a repeated write duplicates |
 * | anything whose body cannot be replayed    | never                               |
 *
 * `refreshSchemaCache` (`apiClient.ts`) is the one deliberate bypass: it calls
 * the ORIGINAL fetch, captured before interception, and its failure is already
 * swallowed on purpose — a cache-invalidation notification, not a read the UI
 * waits on.
 */
export function retryPolicyFor({ url, method, apiBaseUrl, replayable }: RequestShape): RetryPolicy | null {
  if (!replayable) return null
  const verb = method.toUpperCase()
  const underApi = isUnder(url, apiBaseUrl)

  if (verb === 'GET' || verb === 'HEAD') {
    return { statuses: READ_RETRYABLE, retryNotFound: underApi, retryNetworkError: true }
  }

  if (verb === 'POST' && underApi && /\/rpc\/[^/?#]+/.test(url.slice(apiBaseUrl!.replace(/\/+$/, '').length))) {
    return { statuses: CALL_RETRYABLE, retryNotFound: true, retryNetworkError: false }
  }

  return null
}

export interface RetryOptions extends Partial<RetryPolicy> {
  /** Ceiling on attempts including the first. Defaults to MAX_ATTEMPTS. */
  attempts?: number
  /** Total time budget, first request included. Defaults to MAX_ELAPSED_MS. */
  maxElapsedMs?: number
  /**
   * How to wait. Defaults to a real timer; a test passes a recorder so the
   * delays the policy asks for can be ASSERTED instead of spent.
   */
  sleep?: (ms: number) => Promise<void>
  /** The clock. Defaults to Date.now; a test advances it by what it "slept". */
  now?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The loop itself, over any request function.
 *
 * Split from the interceptor so the loop — how many attempts, which statuses,
 * how long between them, when the budget is spent — is a pure function of a
 * `send()` the caller supplies. `retry.test.ts` calls it with a plain function
 * returning real `Response` objects, which means the policy is tested without
 * replacing `fetch` and without a server.
 *
 * Returns the LAST response — it does not throw on a failing status, exactly
 * like `fetch` — so a caller's existing error handling is unchanged; it just
 * runs later, and only for a failure that survived the retries. A thrown
 * network error is retried when the policy allows it, and rethrown if the last
 * attempt also throws. Only a `TypeError` is a network error; an abort or any
 * other exception is the caller's and is rethrown at once.
 */
export async function withRetry(
  send: () => Promise<Response>,
  {
    attempts = MAX_ATTEMPTS,
    maxElapsedMs = MAX_ELAPSED_MS,
    statuses = READ_RETRYABLE,
    retryNotFound = false,
    retryNetworkError = true,
    sleep = defaultSleep,
    now = Date.now,
  }: RetryOptions = {},
): Promise<Response> {
  const started = now()

  for (let attempt = 0; attempt < attempts; attempt++) {
    const isLast = attempt === attempts - 1
    let delay: number
    try {
      const response = await send()
      if (response.ok || isLast) return response
      const transient =
        response.status === COLD_START_STATUS
          ? retryNotFound && !(await isDefinitiveNotFound(response))
          : statuses.has(response.status)
      if (!transient) return response
      delay = retryDelayMs(attempt, response.headers.get('retry-after'), now())
      // The budget: a wait that would end past it is not shortened, it ends
      // the attempt — the response goes back to the caller as the answer.
      if (now() - started + delay > maxElapsedMs) return response
    } catch (err) {
      if (isLast || !retryNetworkError || !(err instanceof TypeError)) throw err
      delay = retryDelayMs(attempt, null, now())
      if (now() - started + delay > maxElapsedMs) throw err
    }
    await sleep(delay)
  }

  // Unreachable: the loop either returns or throws on its last iteration. Kept
  // so a future edit to the bounds cannot silently fall out with `undefined`.
  throw new Error('withRetry: exhausted attempts without a response')
}

/** The HTTP status a thrown error carries, when the thrower attached one to `cause`. */
export function statusOf(err: unknown): number | undefined {
  if (!(err instanceof Error)) return undefined
  const cause = err.cause
  if (typeof cause !== 'object' || cause === null) return undefined
  const status = (cause as { status?: unknown; statusCode?: unknown }).status ??
    (cause as { statusCode?: unknown }).statusCode
  return typeof status === 'number' ? status : undefined
}
