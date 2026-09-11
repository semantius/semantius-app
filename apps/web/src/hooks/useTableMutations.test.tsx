import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCreateRecord, useUpdateRecord, useDeleteRecord } from './useTableMutations'
import { getApiConfig } from '@/lib/apiClient'
import { appWrapper, bootApp } from '@/test/appHarness'
import { disableCollector } from '@/i18n/missing'
import { testToken } from '@/test/session'

/**
 * The three mutation hooks against the real tenant.
 *
 * WHAT CHANGED AND WHY. This file replaced `globalThis.fetch`, `./useAuth`,
 * `@/lib/apiClient` and `@/lib/config` — four modules, of which three are ours —
 * and then asserted the arguments it had passed to its own replacement. Two of
 * its six expectations were provably wrong about the server:
 *
 *   - it asserted a PATCH against a missing row errors with "Record not found".
 *     PostgREST answers `200 []`, and the hook reported SUCCESS with
 *     `undefined` data — which this file pinned as-is for a while, as the
 *     product decision it was. The decision is made: an empty representation
 *     is "this record no longer exists", and both hooks throw it.
 *   - it asserted the same for a DELETE. PostgREST answers a bodyless `204`
 *     unless asked for the representation, which the hook now does; `[]` is
 *     the same error.
 *
 * Neither could have been noticed, because the mock was written from the same
 * assumption as the assertion. What replaces them is a round trip: mutate, then
 * read the row back over a SEPARATE request that does not go through the code
 * under test.
 *
 * WRITES AND CLEANUP. These tests create rows in the shared test tenant. Every
 * one is a `modules` row named `_vitest_…`, and `afterEach` deletes the whole
 * prefix — so a crashed run leaves at most one generation of rows behind, and
 * the next run removes them. Deleting a module cascades to its entities
 * (verified by the last test here, which is the only assertion of that claim
 * anywhere in the repo), so nothing else needs a teardown of its own.
 */

const TABLE = 'modules'
/** Every row this file writes carries it, and cleanup deletes by it. */
const PREFIX = '_vitest_'

function moduleFixture() {
  const slug = `vitest_${crypto.randomUUID().slice(0, 8)}`
  return {
    module_name: `${PREFIX}${slug}`,
    description: 'written by useTableMutations.test.tsx',
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
async function db(path: string, init: RequestInit = {}): Promise<Response> {
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

async function createModule(): Promise<Record<string, unknown>> {
  const res = await db(`/${TABLE}`, { method: 'POST', body: JSON.stringify(moduleFixture()) })
  expect(res.ok).toBe(true)
  const [row] = (await res.json()) as Record<string, unknown>[]
  return row
}

async function readModule(id: unknown): Promise<Record<string, unknown> | undefined> {
  const res = await db(`/${TABLE}?id=eq.${id}`)
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows[0]
}

describe('useTableMutations', () => {
  beforeEach(async () => {
    await bootApp()
    // The module this file creates is a FIXTURE, and its name and description
    // are rendered through `translate()` like any other model text — so
    // discovery recorded `module.vitest_<random>.name` and `.description` into
    // the shipped `en-US.json` on every run. The slug carries a fresh
    // `randomUUID` each time, so the index gained two keys per run that no
    // screen will ever render again, and `i18n:extract` cannot prune them
    // because it never touches `module.*`. Nothing this file renders belongs in
    // the index; the collector stays off for the whole file.
    disableCollector()
  })

  afterEach(async () => {
    // `like` with `*` is PostgREST's wildcard. Unconditional, so a test that
    // threw before its own cleanup still gets one.
    await db(`/${TABLE}?module_name=like.${PREFIX}*`, { method: 'DELETE' })
  })

  describe('useCreateRecord', () => {
    it('writes the row, and the database has it afterwards', async () => {
      const fixture = moduleFixture()
      const { result } = renderHook(() => useCreateRecord(TABLE), { wrapper: appWrapper })

      result.current.mutate(fixture)

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      // PostgREST returns an array; the hook unwraps the first element. The id
      // is the database's, which is the whole point — a mock cannot mint one.
      const created = result.current.data as Record<string, unknown>
      expect(created.id).toBeTypeOf('number')
      expect(created.module_name).toBe(fixture.module_name)

      const persisted = await readModule(created.id)
      expect(persisted?.module_name).toBe(fixture.module_name)
    })

    it('surfaces the constraint the database enforced', async () => {
      const { result } = renderHook(() => useCreateRecord(TABLE), { wrapper: appWrapper })

      result.current.mutate({ ...moduleFixture(), module_name: null })

      await waitFor(() => expect(result.current.isError).toBe(true))

      // The real message, from the real constraint. `23502` is not-null.
      expect(result.current.error?.message).toContain('module_name')
      expect(result.current.error?.cause).toMatchObject({ code: '23502' })
    })

    it('refuses a table name that could escape the base url', async () => {
      const { result } = renderHook(() => useCreateRecord('../etc/passwd'), {
        wrapper: appWrapper,
      })

      result.current.mutate({ anything: true })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error?.message).toBe('Invalid table name')
    })

    it('upserts on the columns named in onConflict, merging into the existing row', async () => {
      // `modules.module_slug` is a real unique constraint on the tenant, so
      // the second insert genuinely conflicts and PostgREST genuinely merges —
      // the row keeps its id and takes the new description. This is the
      // option a generic upsert needs; proven here against a real constraint.
      const row = await createModule()
      const { result } = renderHook(() => useCreateRecord(TABLE, { onConflict: ['module_slug'] }), {
        wrapper: appWrapper,
      })

      result.current.mutate({
        ...moduleFixture(),
        module_slug: row.module_slug,
        module_name: row.module_name,
        description: 'merged by the upsert',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      const merged = result.current.data as Record<string, unknown>
      expect(merged.id).toBe(row.id)
      expect(merged.description).toBe('merged by the upsert')

      const persisted = await readModule(row.id)
      expect(persisted?.description).toBe('merged by the upsert')
    })

    it('refuses a conflict column that could escape the query string', async () => {
      const { result } = renderHook(() => useCreateRecord(TABLE, { onConflict: ['module_slug)&x=1'] }), {
        wrapper: appWrapper,
      })

      result.current.mutate(moduleFixture())

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error?.message).toBe('Invalid column name')
    })
  })

  describe('useUpdateRecord', () => {
    it('patches the row, and the database holds the new value', async () => {
      const row = await createModule()
      const { result } = renderHook(() => useUpdateRecord(TABLE), { wrapper: appWrapper })

      result.current.mutate({ id: row.id, description: 'patched by the test' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect((result.current.data as Record<string, unknown>).description).toBe(
        'patched by the test',
      )
      // The id must NOT be in the payload — the hook strips it — and the row
      // must still be the same row.
      const persisted = await readModule(row.id)
      expect(persisted?.description).toBe('patched by the test')
      expect(persisted?.module_name).toBe(row.module_name)
    })

    it('requires the id field before it sends anything', async () => {
      const { result } = renderHook(() => useUpdateRecord(TABLE), { wrapper: appWrapper })

      result.current.mutate({ description: 'no id here' })

      await waitFor(() => expect(result.current.isError).toBe(true))
      // The TEMPLATE, uninterpolated: the values sit on `cause` and the
      // sentence is rendered where it is displayed (lib/apiErrors.ts), so a
      // language switch reaches an error already on screen.
      expect(result.current.error?.message).toBe('{field} is required for update')
      expect(result.current.error?.cause).toMatchObject({ values: { field: 'id' } })
    })

    it('reports an id that matches no row as an error, not as "saved"', async () => {
      const { result } = renderHook(() => useUpdateRecord(TABLE), { wrapper: appWrapper })

      result.current.mutate({ id: 2147483647, description: 'nothing to patch' })

      await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true))

      // PostgREST answers `200 []` for a filter that matches nothing — the
      // server never sends a 404 here. The hook reads the empty representation
      // and turns it into the error the user needs, with the id it looked for.
      expect(result.current.isError).toBe(true)
      expect(result.current.error?.message).toMatch(/no longer exists/)
      expect(result.current.error?.cause).toMatchObject({ status: 404, matched: 0, id: 2147483647 })
    })
  })

  describe('useDeleteRecord', () => {
    it('removes the row from the database', async () => {
      const row = await createModule()
      const { result } = renderHook(() => useDeleteRecord(TABLE), { wrapper: appWrapper })

      result.current.mutate(row.id as number)

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(await readModule(row.id)).toBeUndefined()
    })

    it('reports an id that matches no row as an error, not as "deleted"', async () => {
      const { result } = renderHook(() => useDeleteRecord(TABLE), { wrapper: appWrapper })

      result.current.mutate(2147483647)

      await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true))

      // A bodyless 204 said nothing; the hook asks for the representation and
      // an empty one is the row that was not there.
      expect(result.current.isError).toBe(true)
      expect(result.current.error?.message).toMatch(/no longer exists/)
      expect(result.current.error?.cause).toMatchObject({ status: 404, matched: 0 })
    })

    it('surfaces the server error when the id column does not exist', async () => {
      const { result } = renderHook(() => useDeleteRecord(TABLE, 'bogus_column'), {
        wrapper: appWrapper,
      })

      result.current.mutate(1)

      await waitFor(() => expect(result.current.isError).toBe(true))

      expect(result.current.error?.message).toContain('bogus_column')
      expect(result.current.error?.cause).toMatchObject({ code: '42703' })
    })

    it('deleting a module deletes the entities that belong to it', async () => {
      const row = await createModule()
      const tableName = `${PREFIX}entity_${crypto.randomUUID().slice(0, 8)}`
      const created = await db('/entities', {
        method: 'POST',
        body: JSON.stringify({
          table_name: tableName,
          singular: 'probe',
          plural: 'probes',
          singular_label: 'Probe',
          plural_label: 'Probes',
          module_id: row.id,
          id_column: 'id',
          label_column: 'name',
          managed: false,
        }),
      })
      expect(created.ok).toBe(true)

      const { result } = renderHook(() => useDeleteRecord(TABLE), { wrapper: appWrapper })
      result.current.mutate(row.id as number)
      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      // The claim the teardown above rests on: nothing here deletes the entity,
      // so if the cascade ever stops, this fails rather than silently leaking
      // rows into the tenant.
      const left = await db(`/entities?table_name=eq.${tableName}`)
      expect(await left.json()).toEqual([])
    })
  })

  describe('the schema cache', () => {
    it('is refreshed after a mutation on a schema table', async () => {
      const row = await createModule()
      const tableName = `${PREFIX}entity_${crypto.randomUUID().slice(0, 8)}`

      // Resource timing is the browser's own record of what it fetched — a real
      // observation, and the only one available here: `refreshSchemaCache` calls
      // the fetch it captured at import time (before the auth interceptor
      // replaced the global), so a spy on `globalThis.fetch` cannot see it.
      performance.clearResourceTimings()

      const { result } = renderHook(() => useCreateRecord('entities'), { wrapper: appWrapper })
      result.current.mutate({
        table_name: tableName,
        singular: 'probe',
        plural: 'probes',
        singular_label: 'Probe',
        plural_label: 'Probes',
        module_id: row.id,
        id_column: 'id',
        label_column: 'name',
        managed: false,
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      // Fired from onSuccess and deliberately not awaited by the hook, so poll.
      // Fired from onSuccess and deliberately not awaited by the hook, so poll.
      // The default one-second budget is too short: the endpoint takes about two
      // seconds to answer, and the entry only lands when it does.
      await expect
        .poll(
          () =>
            performance
              .getEntriesByType('resource')
              .some((entry) => entry.name.endsWith('/refresh-schema-cache')),
          { timeout: 15000, interval: 250 },
        )
        .toBe(true)

      // The entity goes with the module (see the cascade test above).
    })
  })
})
