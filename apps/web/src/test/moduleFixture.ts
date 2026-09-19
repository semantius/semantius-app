import { getApiConfig } from '@/lib/apiClient'
import { testToken } from './session'

/**
 * `modules` rows written by tests, and the one way they are cleaned up.
 *
 * A `modules` row is the fixture of choice because deleting a module cascades
 * to its entities (asserted in `hooks/useTableMutations.test.tsx`), so one
 * delete by prefix cleans up everything a test built inside it. Every row
 * carries `PREFIX` in `module_name`; `deleteVitestModules()` removes all of
 * them, so a run that crashed leaves at most one generation behind and the next
 * run's cleanup takes it.
 */

/** Every row a test writes carries it, and cleanup deletes by it. */
export const PREFIX = '_vitest_'

/**
 * A fresh module row. `writtenBy` names the test file, and lands in the row's
 * description so a leftover row says where it came from.
 */
export function moduleFixture(writtenBy: string) {
  const slug = `vitest_${crypto.randomUUID().slice(0, 8)}`
  return {
    module_name: `${PREFIX}${slug}`,
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
 * Delete every module whose name carries `PREFIX` — and, by the cascade, their
 * entities. `like` with `*` is PostgREST's wildcard. Call it from `afterEach`,
 * unconditionally, so a test that threw before its own cleanup still gets one.
 */
export async function deleteVitestModules(): Promise<void> {
  await db(`/modules?module_name=like.${PREFIX}*`, { method: 'DELETE' })
}
