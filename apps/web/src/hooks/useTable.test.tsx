import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTable } from './useTable'
import { appWrapper, bootApp, bootAppSignedOut } from '@/test/appHarness'
import { clearSession } from '@/test/session'

/**
 * `useTable` against the real tenant, with the real session.
 *
 * WHAT CHANGED AND WHY. This file used to replace `globalThis.fetch` and
 * `@/hooks/useAuth`, then assert the URL string and the header object the hook
 * had passed to the replacement. That checks that the hook calls a function the
 * test wrote — it cannot see a query the server rejects, a `Content-Range` that
 * is not exposed to the page, a CORS preflight the endpoint refuses, or an error
 * body whose shape has moved. All four are real ways this hook breaks, and all
 * four were invisible.
 *
 * So the assertions moved from the request to its EFFECT: rows that came back,
 * a projection the server applied, a count it reported, a message it wrote. The
 * URL is asserted implicitly and far more strictly — a wrong one answers 404.
 *
 * The one thing left out is the "error response with no `message` field"
 * fallback. PostgREST puts a `message` on every error it returns (verified
 * across a missing table, a missing column, an unparseable `limit` and a bad
 * cast), so that branch is not reachable from this server, and a hand-written
 * `{ ok: false }` object to reach it would be exactly the thing this file just
 * stopped doing. It is reachable from a non-JSON error page, which is what §10's
 * transient-failure work drives through Playwright interception.
 */

/** A table every tenant has, with a stable integer `id`. */
const TABLE = 'modules'

describe('useTable', () => {
  // A call-through spy. It replaces nothing — `vi.spyOn` keeps the real
  // implementation — and exists only for the two assertions that are about a
  // request NOT being made, which is not observable from the hook's result.
  let fetchSpy: MockInstance<typeof fetch>
  const requestedTable = () =>
    fetchSpy.mock.calls.some(([input]) => String(input).includes(`/${TABLE}`))

  beforeEach(async () => {
    await bootApp()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    clearSession()
  })

  it('returns the tenant’s rows', async () => {
    const { result } = renderHook(() => useTable(TABLE), { wrapper: appWrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.error).toBeNull()
    // Not "equals the rows the test wrote": the point is that these came from
    // the database. Every row is an object carrying the primary key.
    expect(result.current.data!.length).toBeGreaterThan(0)
    for (const row of result.current.data!) {
      expect(row).toBeTypeOf('object')
      expect(row).toHaveProperty('id')
    }
  })

  it('sends the PostgREST query, and the server applies it', async () => {
    const { result } = renderHook(
      () => useTable(TABLE, { query: 'select=id,module_slug&order=id.asc&limit=2' }),
      { wrapper: appWrapper },
    )

    await waitFor(() => expect(result.current.data).toBeDefined())

    const rows = result.current.data!
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(2)
    // The projection proves `select` arrived; the ordering proves `order` did.
    // A query string that never reached the server would return whole rows.
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(['id', 'module_slug'])
    const ids = rows.map((row) => row.id as number)
    expect([...ids].sort((a, b) => a - b)).toEqual(ids)
  })

  it('reads the total count out of the Content-Range header', async () => {
    const { result } = renderHook(() => useTable(TABLE, { count: true, query: 'limit=1' }), {
      wrapper: appWrapper,
    })

    await waitFor(() => expect(result.current.data).toBeDefined())

    // Untestable against a replaced fetch: `Content-Range` only reaches page
    // script because the endpoint lists it in `Access-Control-Expose-Headers`.
    // A mock hands the header over regardless, so this parse has never before
    // been exercised on a response a browser actually produced.
    expect(result.current.totalCount).toBeTypeOf('number')
    expect(result.current.totalCount!).toBeGreaterThanOrEqual(result.current.data!.length)
  })

  it('surfaces the server’s own error message and body', async () => {
    const missing = 'no_such_table_used_by_a_test'
    const { result } = renderHook(() => useTable(missing), { wrapper: appWrapper })

    await waitFor(() => expect(result.current.error).not.toBeNull())

    // PostgREST names the table it could not find. The hook's own fallback
    // ("Failed to fetch <table>") would not, so this also pins which branch ran.
    expect(result.current.error!.message).toContain(missing)
    // ApiErrorDisplay renders `cause` in its Details panel — this is the real
    // payload it would show, PostgREST error code and all.
    expect(result.current.error!.cause).toMatchObject({ code: expect.any(String) })
  })

  it('does not request anything when there is no session', async () => {
    await bootAppSignedOut()
    fetchSpy.mockClear()

    const { result } = renderHook(() => useTable(TABLE), { wrapper: appWrapper })

    // Nothing to wait for — assert it stays that way rather than racing it.
    await expect.poll(() => result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(requestedTable()).toBe(false)
  })

  it('respects the enabled option', async () => {
    const { result } = renderHook(() => useTable(TABLE, { enabled: false }), {
      wrapper: appWrapper,
    })

    await expect.poll(() => result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(requestedTable()).toBe(false)
  })

  it('refuses a table name that could escape the base url', async () => {
    const { result } = renderHook(() => useTable('../etc/passwd'), { wrapper: appWrapper })

    await waitFor(() => expect(result.current.error).not.toBeNull())

    expect(result.current.error!.message).toContain('Invalid table name')
    // The guard is only worth anything if it runs BEFORE the request.
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('passwd'))).toBe(false)
  })

  it('accepts a table name with an underscore', async () => {
    // A real table, so the answer proves the name survived the guard AND
    // addressed something: a rejected name errors, a wrong one 404s.
    const { result } = renderHook(() => useTable('user_bookmarks'), { wrapper: appWrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.error).toBeNull()
    expect(Array.isArray(result.current.data)).toBe(true)
  })
})
