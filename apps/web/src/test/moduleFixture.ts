import { getApiConfig } from '@/lib/apiClient'
import { testToken } from './session'

/**
 * `modules` rows written by tests, and the one way they are cleaned up.
 *
 * A `modules` row is the fixture of choice because deleting a module cascades
 * to its entities (asserted in `hooks/useTableMutations.test.tsx`), so one
 * delete by name cleans up everything a test built inside it.
 *
 * Cleanup deletes only THIS file run's rows. Test files run in parallel (four
 * browser workers) and CI shares the tenant, so a delete of every `_vitest_`
 * row removed fixtures that another file was still waiting to see in a grid.
 * Leftovers from a crashed run are swept once they are an hour old.
 */

/** Every row a test writes carries it. */
export const PREFIX = '_vitest_'

/**
 * Unique per file run: Vitest gives each test file its own module instance, so
 * every file that imports this one gets a fresh value.
 */
const RUN_PREFIX = `${PREFIX}${crypto.randomUUID().slice(0, 8)}_`

/** Old enough that no run still in progress can own the row. */
const STALE_AFTER_MS = 60 * 60 * 1000

/**
 * A fresh module row. `writtenBy` names the test file, and lands in the row's
 * description so a leftover row says where it came from.
 */
export function moduleFixture(writtenBy: string) {
  const slug = `vitest_${crypto.randomUUID().slice(0, 8)}`
  return {
    module_name: `${RUN_PREFIX}${slug}`,
    description: `written by ${writtenBy}`,
    module_type: 'domain',
    module_slug: slug,
    view_permission: 'admin',
    home_page: `/${slug}`,
  }
}

/**
 * A request to the tenant that does NOT go through the hooks — arrange a row,
 * read one back, clean up. Sharing the code under test between the action and
 * the check is how a broken write passes its own test.
 */
export async function db(path: string, init: RequestInit = {}): Promise<Response> {
  const { baseUrl } = getApiConfig()
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${testToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
}

/**
 * Delete this file run's modules (and, by the cascade, their entities), plus any
 * `_vitest_` module an hour old or older. `like` with `*` is PostgREST's
 * wildcard. Call it from `afterEach`, unconditionally, so a test that threw
 * before its own cleanup still gets one.
 */
export async function deleteVitestModules(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString()
  await Promise.all([
    db(`/modules?module_name=like.${RUN_PREFIX}*`, { method: 'DELETE' }),
    db(`/modules?module_name=like.${PREFIX}*&created_at=lt.${staleBefore}`, { method: 'DELETE' }),
  ])
}
