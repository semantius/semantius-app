import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { initConfig } from '@/lib/config'
import { testToken } from '@/test/session'
import {
  SAVE_PREFERENCES_RPC,
  SOURCE_LANGUAGE,
  TENANT_TABLE,
  activateLocale,
  availableLocales,
  buildLabelInventory,
  currentLabels,
  diffLabelInventory,
  isPreferenceRpcAbsent,
  isTenantTableAbsent,
  rowsToLocaleFiles,
  sessionPreferenceFrom,
  setTenantLocaleFiles,
  tenantPageQuery,
  translate,
  type FieldRow,
  type ModuleRow,
  type TableRow,
  type TranslationRow,
} from '@/i18n'
import { disableCollector, enableCollector, flush } from '@/i18n/missing'

/**
 * The tenant layer, against the REAL tenant.
 *
 * Most of it cannot pass yet, and that is the point of the file. `ui_translations`,
 * its policies and the `set_user_preferences` RPC come from a platform migration
 * that has not been applied to the test tenant — so those tests SKIP WITH A
 * MESSAGE naming what is missing, rather than being written against a fake table
 * that would pass forever and prove nothing. The moment the migration lands they
 * run for real, with no edit here.
 *
 * What DOES run today: the model reads the label inventory is built from, and
 * the two "is this platform feature present" predicates, which are asserted
 * against the real 404 bodies rather than against a description of them.
 */

/** A locale nothing else uses, so the run cannot disturb a real translation. */
const TEST_LOCALE = 'xx-TEST'

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

async function bodyCode(response: Response): Promise<string | undefined> {
  const body: unknown = await response.clone().json().catch(() => null)
  return body && typeof body === 'object' ? ((body as Record<string, unknown>).code as string) : undefined
}

// TOP-LEVEL AWAIT, not `beforeAll`. `describe.skipIf` is evaluated while the
// file is being COLLECTED, before any hook has run — so a flag set in a
// `beforeAll` is still `false` at that moment and the block would skip forever,
// including after the migration lands. Probing here is what makes the skip
// temporary rather than permanent.
const apiUrl = (await initConfig()).apiBaseUrl
const token = testToken()
const probe = await api(`/${TENANT_TABLE}?limit=1`)
/** Whether the platform migration has been applied to this tenant. */
const tableExists = probe.ok
if (!tableExists) {
  // Reported once, loudly. A skipped test that says nothing is a test nobody
  // ever notices has stopped covering anything.
  console.warn(
    `[i18n] ${TENANT_TABLE} is absent from this tenant (${probe.status} ${await bodyCode(probe)}). ` +
      'The tenant-layer tests are skipped; apply the platform migration to run them.',
  )
}

afterEach(async () => {
  setTenantLocaleFiles(new Map())
  disableCollector()
  await activateLocale({ language: SOURCE_LANGUAGE, locale: SOURCE_LANGUAGE })
})

afterAll(async () => {
  if (!tableExists) return
  await api(`/${TENANT_TABLE}?locale=eq.${TEST_LOCALE}`, { method: 'DELETE' })
})

describe('the platform features this layer needs', () => {
  it('recognizes an absent table by its BODY, never by a status', async () => {
    const probe = await api(`/${TENANT_TABLE}?limit=1`)
    if (probe.ok) {
      expect(tableExists).toBe(true)
      return
    }
    // The real 404 body. A bare 404 under the API base is a cold start, which
    // the fetch interceptor retries — only a PostgREST code is definitive, and
    // this is where that distinction is checked against the real thing.
    const code = await bodyCode(probe)
    const error = new Error('probe', { cause: { status: probe.status, code } })
    expect(isTenantTableAbsent(error)).toBe(true)
    expect(isTenantTableAbsent(new Error('probe', { cause: { status: 404 } }))).toBe(false)
  })

  it('recognizes an absent preferences RPC by its own code', async () => {
    const probe = await api(`/rpc/${SAVE_PREFERENCES_RPC}`, { method: 'POST', body: '{}' })
    if (probe.ok) return
    const error = new Error('probe', { cause: { status: probe.status, code: await bodyCode(probe) } })
    expect(isPreferenceRpcAbsent(error)).toBe(true)
  })

  it('reads no language preference off a get_userinfo that has no such column', async () => {
    const response = await api('/rpc/get_userinfo', { method: 'POST', body: '{}' })
    const info: Record<string, unknown> = await response.json()

    // ABSENT, not null. That distinction is what keeps a login on a platform
    // without the columns from clearing the language this browser chose.
    const preference = sessionPreferenceFrom(info, null)
    if ('language' in info) {
      expect(preference.language === null || typeof preference.language === 'string').toBe(true)
    } else {
      expect(preference.language).toBeUndefined()
      expect(preference.locale).toBeUndefined()
    }
  })
})

describe('the model the label inventory is built from', () => {
  it('reads tables, fields and modules with the columns the inventory needs', async () => {
    const [tables, fields, modules] = await Promise.all([
      api('/tables?select=table_name,singular_label,plural_label,description,updated_at&limit=200').then((r) =>
        r.json() as Promise<TableRow[]>,
      ),
      api(
        '/fields?select=table_name,field_name,title,description,enum_values,relationship_label,' +
          'singular_label_parent,plural_label_parent,updated_at&limit=1000',
      ).then((r) => r.json() as Promise<FieldRow[]>),
      api('/modules?select=module_slug,module_name,description,updated_at&limit=200').then((r) =>
        r.json() as Promise<ModuleRow[]>,
      ),
    ])

    expect(tables.length).toBeGreaterThan(0)
    expect(fields.length).toBeGreaterThan(0)
    expect(modules.length).toBeGreaterThan(0)

    const inventory = buildLabelInventory({ tables, fields, modules })
    expect(inventory.length).toBeGreaterThan(tables.length)
    // The four scopes all occur in a real model — an enum among them, which is
    // the one whose source is the stored value rather than a label.
    expect(new Set(inventory.map((entry) => entry.scope))).toEqual(
      new Set(['table', 'column', 'enum', 'module']),
    )

    // With no translations at all, everything is missing and nothing is orphaned.
    const diff = diffLabelInventory(inventory, {})
    expect(diff.missing).toHaveLength(inventory.length)
    expect(diff.orphaned).toHaveLength(0)
  })
})

describe.skipIf(!tableExists)('translations stored as rows', () => {
  const rows: TranslationRow[] = [
    { locale: TEST_LOCALE, scope: 'message', key: 'Language', context: '', translation: 'Sprogvalg' },
    { locale: TEST_LOCALE, scope: 'table', key: 'customers.plural_label', context: '', translation: 'Kunder' },
    {
      locale: TEST_LOCALE,
      scope: 'server',
      key: 'Order must have at least one line',
      context: '',
      translation: 'En ordre skal have mindst en linje',
    },
  ]

  beforeAll(async () => {
    const written = await api(`/${TENANT_TABLE}?on_conflict=locale,scope,key,context`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    })
    expect(written.ok, await written.text()).toBe(true)
  })

  it('reads back through the query the prefetch uses, and activates', async () => {
    const response = await api(`/${TENANT_TABLE}?${tenantPageQuery(0)}&locale=eq.${TEST_LOCALE}`)
    const read: TranslationRow[] = await response.json()

    expect(read.length).toBeGreaterThanOrEqual(rows.length)
    setTenantLocaleFiles(rowsToLocaleFiles(read))

    // A language the build ships no catalog for is switchable purely because the
    // tenant has rows for it.
    expect(availableLocales().map((entry) => entry.code)).toContain(TEST_LOCALE)

    await activateLocale({ language: TEST_LOCALE, locale: SOURCE_LANGUAGE })
    expect(translate('Language')).toBe('Sprogvalg')
    expect(currentLabels()['table:customers.plural_label']).toBe('Kunder')
  })

  it('excludes the queue from the layer — an empty row is a request', async () => {
    await api(`/${TENANT_TABLE}?on_conflict=locale,scope,key,context`, {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([
        { locale: TEST_LOCALE, scope: 'message', key: 'Settings', context: '', translation: '' },
      ]),
    })

    const response = await api(`/${TENANT_TABLE}?${tenantPageQuery(0)}&locale=eq.${TEST_LOCALE}`)
    const read: TranslationRow[] = await response.json()

    expect(read.some((row) => row.key === 'Settings')).toBe(false)
  })

  it('records a miss the collector met, without overwriting a translation', async () => {
    enableCollector()
    await activateLocale({ language: TEST_LOCALE, locale: SOURCE_LANGUAGE })

    // A string with no entry, met the way the app meets one.
    expect(translate('An unmistakably untranslated string')).toBe('An unmistakably untranslated string')
    await flush()

    const queue = await api(
      `/${TENANT_TABLE}?select=key,translation&locale=eq.${TEST_LOCALE}&translation=eq.`,
    ).then((r) => r.json() as Promise<TranslationRow[]>)
    expect(queue.some((row) => row.key === 'An unmistakably untranslated string')).toBe(true)

    // `ignore-duplicates` is the safety property: a request can never undo a
    // translation, so the row written above is still translated.
    const translated = await api(
      `/${TENANT_TABLE}?select=key,translation&locale=eq.${TEST_LOCALE}&key=eq.Language`,
    ).then((r) => r.json() as Promise<TranslationRow[]>)
    expect(translated[0]?.translation).toBe('Sprogvalg')
  })
})
