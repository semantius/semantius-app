import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getApiConfig } from '@/lib/apiClient'
import { getConfig, initConfig } from '@/lib/config'
import { testToken } from '@/test/session'
import { encodeBytes, decodeBytes } from '@/lib/fileEncoding'

/**
 * What the tenant actually stores and hands back for the formats this app had
 * no control for.
 *
 * Every encoding decision in `lib/fileEncoding.ts` and every `emptyValue` rule
 * in the format registry is a claim about a real column, and the one that
 * matters most cannot be caught any other way: posting base64 into a BYTEA
 * column answers 201, not an error — PostgreSQL parses it as its own escape
 * format and stores the literal ASCII bytes. Nothing downstream ever says the
 * encoding was wrong, so it has to be proven right here.
 *
 * The fixture is a `_vitest_` module with a MANAGED entity, so the DD issues
 * the DDL and a real table exists. Deleting the module cascades to the entity
 * and its table (asserted in useTableMutations.test.tsx), which is the whole
 * cleanup.
 */

const PREFIX = '_vitest_'
const REFRESH_TIMEOUT_MS = 60_000
const SAMPLE = new Uint8Array([0x48, 0x69, 0x0a, 0x00, 0xff])

let baseUrl: string
let moduleId: number
let table: string

async function db(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(baseUrl + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + testToken(),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
}

// `name` is deliberately absent: it is the entity's `label_column`, and the DD
// creates that column itself — adding it again is a duplicate key on fields_pkey.
const FIELDS: [name: string, format: string][] = [
  ['blob_bin', 'binary'],
  ['blob_b64', 'byte'],
  ['shape', 'object'],
  ['items', 'array'],
  ['rule', 'jsonlogic'],
  ['at_time', 'time'],
  ['on_date', 'date'],
  ['how_long', 'duration'],
]

beforeAll(async () => {
  await initConfig()
  baseUrl = getApiConfig().baseUrl
  const suffix = crypto.randomUUID().slice(0, 8)
  const slug = 'vitest_' + suffix
  table = PREFIX + 'fmt_' + suffix

  const modRes = await db('/modules', {
    method: 'POST',
    body: JSON.stringify({
      module_name: PREFIX + slug,
      module_slug: slug,
      module_type: 'domain',
      view_permission: 'admin',
      home_page: '/' + slug,
      description: 'written by formatRoundTrip.test.ts',
    }),
  })
  expect(modRes.ok).toBe(true)
  const [mod] = (await modRes.json()) as { id: number }[]
  moduleId = mod.id

  const entRes = await db('/entities', {
    method: 'POST',
    body: JSON.stringify({
      table_name: table,
      singular: 'fmtprobe',
      plural: 'fmtprobes',
      singular_label: 'Format probe',
      plural_label: 'Format probes',
      module_id: moduleId,
      id_column: 'id',
      label_column: 'name',
      managed: true,
    }),
  })
  expect(entRes.ok).toBe(true)

  for (const [field_name, format] of FIELDS) {
    const res = await db('/fields', {
      method: 'POST',
      body: JSON.stringify({
        table_name: table,
        field_name,
        title: field_name,
        format,
        input_type: 'default',
      }),
    })
    expect(res.ok, field_name + ': ' + (await res.clone().text())).toBe(true)
  }

  // `tenantName` is on the config, NOT on getApiConfig() — which returns only
  // baseUrl/type/supabaseApiKey, so reading it there yields undefined and the
  // refresh silently goes to https://undefined.semantius.cloud.
  const tenant = getConfig().tenantName
  const refresh = () =>
    fetch('https://' + tenant + '.semantius.cloud/refresh-schema-cache', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + testToken(), 'Content-Type': 'application/json' },
      body: '{}',
    })

  await refresh()
  const deadline = Date.now() + REFRESH_TIMEOUT_MS
  for (;;) {
    const probe = await db('/' + table + '?limit=1')
    if (probe.ok) break
    if (Date.now() > deadline) throw new Error(table + ' never appeared in the schema cache')
    await new Promise((r) => setTimeout(r, 2000))
    await refresh()
  }
}, 120_000)

afterAll(async () => {
  if (moduleId) await db('/modules?id=eq.' + moduleId, { method: 'DELETE' })
}, 60_000)

async function roundTrip(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await db('/' + table, { method: 'POST', body: JSON.stringify(row) })
  expect(res.ok, await res.clone().text()).toBe(true)
  const [written] = (await res.json()) as Record<string, unknown>[]
  const read = await db('/' + table + '?id=eq.' + written.id)
  const [back] = (await read.json()) as Record<string, unknown>[]
  return back
}

/**
 * A complete row. Every column here is NOT NULL: `is_nullable()` in the
 * backend's 0070_dd_functions.sql returns true only for `reference`, `date`
 * and `date-time`, so a partial insert fails on whichever column it omitted,
 * not on the one under test.
 */
function completeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    blob_bin: encodeBytes(SAMPLE, 'binary'),
    blob_b64: encodeBytes(SAMPLE, 'byte'),
    shape: { a: 1 },
    items: ['x', 'y'],
    rule: { var: 'x' },
    at_time: '14:30:00Z',
    on_date: '2024-03-15',
    how_long: 'P1DT2H',
    ...overrides,
  }
}

describe('format round trip against the tenant', () => {
  it('hands every format back in the shape the app wrote it', async () => {
    const back = await roundTrip(completeRow({ name: 'all' }))

    // binary: PostgREST's hex output, byte for byte what encodeBytes produced.
    expect(back.blob_bin).toBe(encodeBytes(SAMPLE, 'binary'))
    expect(decodeBytes(back.blob_bin as string, 'binary')).toEqual(SAMPLE)

    // byte: plain base64 in a TEXT column.
    expect(back.blob_b64).toBe(encodeBytes(SAMPLE, 'byte'))
    expect(decodeBytes(back.blob_b64 as string, 'byte')).toEqual(SAMPLE)

    // object / array / jsonlogic are JSONB and come back as real values, which
    // is why the form parses the editor's text before submitting.
    expect(back.shape).toEqual({ a: 1 })
    expect(back.items).toEqual(['x', 'y'])
    expect(back.rule).toEqual({ var: 'x' })

    // A calendar date survives as the day it was given.
    expect(back.on_date).toBe('2024-03-15')

    // The column is TIME, not TIMETZ, so the offset the app sends is DROPPED on
    // write. That is why InputTime normalizes a stored value on display rather
    // than assuming what it wrote is what comes back.
    expect(back.at_time).toBe('14:30:00')
  })

  it('accepts base64 into a BYTEA column without complaint', async () => {
    // The reason the encoding has to be right in the client: this is not an
    // error. Postgres reads base64 as its own escape format and stores those
    // ASCII bytes, so a wrong encoding is silent corruption, not a failed save.
    const back = await roundTrip(completeRow({ name: 'wrong', blob_bin: encodeBytes(SAMPLE, 'byte') }))
    expect(back.blob_bin).not.toBe(encodeBytes(SAMPLE, 'binary'))
  })

  // KNOWN DEFECT, recorded rather than fixed here.
  //
  // An INTERVAL column ACCEPTS ISO 8601 on write and hands back PostgreSQL's
  // own output format on read. `InputDuration` is a plain text field whose
  // placeholder is `P3Y6M4DT12H30M5S`, so it writes ISO and then displays
  // "1 day 02:00:00" — a value it did not write and its placeholder says is
  // wrong. Saving that row again stores the Postgres spelling, and the column
  // has drifted from the format's contract without anything failing.
  //
  // The fix is a decision about which representation is canonical (a PostgREST
  // `intervalstyle` on the tenant, or parsing in the control), and it belongs
  // with the owner rather than inside a formats PR. This test pins the current
  // answer so the choice is made deliberately: it fails the day the platform
  // changes it.
  it('hands an ISO duration back in PostgreSQL output format, not ISO', async () => {
    const back = await roundTrip(completeRow({ name: 'duration' }))
    expect(back.how_long).toBe('1 day 02:00:00')
  })

  it('rejects an empty string for the typed columns, which is why emptyValue is null', async () => {
    for (const field of ['on_date', 'at_time']) {
      const res = await db('/' + table, {
        method: 'POST',
        body: JSON.stringify(completeRow({ name: 'empty_' + field, [field]: '' })),
      })
      expect(res.ok, field).toBe(false)
    }
  })
})
