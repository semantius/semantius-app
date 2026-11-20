import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyJsonLogic,
  collectSetRecordLookups,
  computedValueChanged,
  evaluateComputedFields,
  idColumnForEntity,
  lookupFromCache,
  parseComputedFields,
  type RecordLookup,
} from './computedFields'
import { setRuleUser, timestampText } from './ruleContext'

const amountRule = {
  '*': [{ var: 'quantity' }, { var: 'unit_price' }, { '-': [1, { var: 'discount' }] }],
}

const labelRule = {
  set_record: [
    'p',
    'products',
    { var: 'product_id' },
    { cat: [{ var: 'quantity' }, ' × ', { var: 'p.product_name' }] },
  ],
}

// What a rule threw, read off the server-shaped body it carries: the code, the
// message template and the parameters (the JSON hint).
function thrown(run: () => unknown): { code?: unknown; message?: unknown; params?: unknown } {
  try {
    run()
  } catch (error) {
    const cause = (error as Error).cause as { code?: unknown; message?: unknown; hint?: unknown } | undefined
    return {
      code: cause?.code,
      message: cause?.message,
      params: typeof cause?.hint === 'string' ? JSON.parse(cause.hint) : undefined,
    }
  }
  throw new Error('the rule did not throw')
}

function lookup(rows: Record<string, Record<string, unknown>>): RecordLookup {
  return {
    get(entity, id) {
      if (id === null || id === '') return null
      return rows[`${entity}:${id}`] ?? null
    },
  }
}

describe('parseComputedFields', () => {
  it('keeps named entries and drops the rest', () => {
    expect(
      parseComputedFields([
        { name: 'amount', jsonlogic: amountRule },
        { jsonlogic: amountRule },
        { name: '', jsonlogic: amountRule },
        { name: 'label' },
        null,
      ]),
    ).toEqual([{ name: 'amount', jsonlogic: amountRule }])
  })

  it('treats a missing or non-array value as no computed fields', () => {
    expect(parseComputedFields(undefined)).toEqual([])
    expect(parseComputedFields({})).toEqual([])
  })
})

describe('applyJsonLogic', () => {
  it('multiplies the Northwind amount rule', () => {
    expect(applyJsonLogic(amountRule, { quantity: 2, unit_price: 10, discount: 0 })).toBe(20)
    expect(applyJsonLogic(amountRule, { quantity: 2, unit_price: 10, discount: 0.05 })).toBe(19)
  })

  it('binds let before evaluating the body', () => {
    expect(
      applyJsonLogic(
        { let: ['n', { '*': [{ var: 'quantity' }, 2] }, { '+': [{ var: 'n' }, 1] }] },
        { quantity: 3 },
      ),
    ).toBe(7)
  })

  it('concatenates with concat as an alias of cat', () => {
    expect(applyJsonLogic({ concat: [{ var: 'quantity' }, ' × ', 'Chai'] }, { quantity: 2 })).toBe('2 × Chai')
  })

  it('set_record binds the fetched row for the body', () => {
    const records = lookup({ 'products:1': { product_name: 'Chai' } })
    expect(applyJsonLogic(labelRule, { quantity: 2, product_id: 1 }, records)).toBe('2 × Chai')
  })

  it('set_record with no row concatenates an empty product name', () => {
    const records = lookup({})
    expect(applyJsonLogic(labelRule, { quantity: 2, product_id: 1 }, records)).toBe('2 × ')
  })
})

describe('evaluateComputedFields', () => {
  it('evaluates later fields against earlier results', () => {
    const updates = evaluateComputedFields(
      [
        { name: 'amount', jsonlogic: amountRule },
        { name: 'twice', jsonlogic: { '*': [{ var: 'amount' }, 2] } },
      ],
      { quantity: 2, unit_price: 10, discount: 0 },
    )
    expect(updates).toEqual({ amount: 20, twice: 40 })
  })

  it('skips a field whose set_record row is not loaded yet', () => {
    const updates = evaluateComputedFields(
      [
        { name: 'amount', jsonlogic: amountRule },
        { name: 'label', jsonlogic: labelRule },
      ],
      { quantity: 2, unit_price: 10, discount: 0, product_id: 1 },
    )
    expect(updates).toEqual({ amount: 20 })
  })

  it('fills label once the product is in the lookup', () => {
    const records = lookup({ 'products:1': { product_name: 'Chai' } })
    const updates = evaluateComputedFields(
      [
        { name: 'amount', jsonlogic: amountRule },
        { name: 'label', jsonlogic: labelRule },
      ],
      { quantity: 2, unit_price: 10, discount: 0, product_id: 1 },
      records,
    )
    expect(updates).toEqual({ amount: 20, label: '2 × Chai' })
  })

  it('asks for a row whose id comes from another row once that row is there', () => {
    // A set_record inside a set_record: the inner id reads the outer row.
    const entries = [
      {
        name: 'region',
        jsonlogic: {
          set_record: ['c', 'customers', { var: 'customer_id' }, { set_record: ['r', 'regions', { var: 'c.region_id' }, { var: 'r.name' }] }],
        },
      },
    ]
    const cache = new Map<string, Record<string, unknown> | null>()
    const values = { customer_id: 7 }

    const first = lookupFromCache(cache)
    expect(evaluateComputedFields(entries, values, first)).toEqual({})
    expect([...first.missing.keys()]).toEqual(['customers:7'])

    cache.set('customers:7', { region_id: 3 })
    const second = lookupFromCache(cache)
    expect(evaluateComputedFields(entries, values, second)).toEqual({})
    expect([...second.missing.keys()]).toEqual(['regions:3'])

    cache.set('regions:3', { name: 'EU' })
    expect(evaluateComputedFields(entries, values, lookupFromCache(cache))).toEqual({ region: 'EU' })
  })

  it('asks for the row whose id a let or a list element holds', () => {
    const records = lookupFromCache(new Map())
    evaluateComputedFields(
      [
        { name: 'a', jsonlogic: { let: ['pid', 5, { set_record: ['p', 'products', { var: 'pid' }, { var: 'p.product_name' }] }] } },
        { name: 'b', jsonlogic: { map: [[1, 2], { set_record: ['p', 'products', { var: '' }, { var: 'p.product_name' }] }] } },
      ],
      {},
      records,
    )
    expect([...records.missing.keys()].sort()).toEqual(['products:1', 'products:2', 'products:5'])
  })

  it('neither evaluates the id of a set_record in a branch that is not taken nor asks for its row', () => {
    // evaluate_json_logic answers "ok" for this rule (postgres18-ext).
    const records = lookupFromCache(new Map())
    const rule = { if: [true, 'ok', { set_record: ['r', 'products', { '/': [1, 0] }, { var: 'r' }] }] }
    expect(evaluateComputedFields([{ name: 'f', jsonlogic: rule }], {}, records)).toEqual({ f: 'ok' })
    expect(records.missing.size).toBe(0)
  })

  it('writes a dotted name by path, so a later rule reads it there', () => {
    const updates = evaluateComputedFields(
      [
        { name: 'settings.theme', jsonlogic: 'dark' },
        { name: 'label', jsonlogic: { cat: ['theme: ', { var: 'settings.theme' }] } },
      ],
      { settings: { theme: 'light' } },
    )
    expect(updates).toEqual({ 'settings.theme': 'dark', label: 'theme: dark' })
  })

  it('leaves out a dotted name whose parent is not an object, as jsonb_set does', () => {
    expect(evaluateComputedFields([{ name: 'settings.theme', jsonlogic: 'dark' }], {})).toEqual({})
    expect(evaluateComputedFields([{ name: 'settings.theme', jsonlogic: 'dark' }], { settings: null })).toEqual({})
  })

  it("writes a dotted name without touching the form's own objects", () => {
    const values = { settings: { theme: 'light' } }
    evaluateComputedFields([{ name: 'settings.theme', jsonlogic: 'dark' }], values)
    expect(values.settings.theme).toBe('light')
  })

  it('compares a dotted name with the value at its path', () => {
    expect(computedValueChanged({ settings: { theme: 'dark' } }, 'settings.theme', 'dark')).toBe(false)
    expect(computedValueChanged({ settings: { theme: 'light' } }, 'settings.theme', 'dark')).toBe(true)
  })
})

describe('collectSetRecordLookups', () => {
  it('finds the entity and id expression', () => {
    expect(collectSetRecordLookups(labelRule)).toEqual([
      { entity: 'products', idRule: { var: 'product_id' } },
    ])
  })
})

// The backend's own JsonLogic test cases, committed at vendor/semantius/ so they
// run in CI and before a release, where there is no backend checkout. Where
// there is one, the copy must match its COMMITTED state at SEMANTIUS_BACKEND_REF
// (default origin/main), read through git rather than off the disk, so a backend
// change in progress does not fail this repository's tests (see
// packages/sem-schema/src/__tests__/jsonlogic-backend-sync.test.ts).
// `node scripts/vendor-semantius.mjs` refreshes it.
// src/lib -> src -> web -> apps -> repository root
const vendoredPath = resolve(__dirname, '../../../../vendor/semantius/0100_test_jsonlogic.json')
// ... -> its parent
const backendDir = process.env.SEMANTIUS_BACKEND_DIR ?? resolve(__dirname, '../../../../../semantius')
const backendRef = process.env.SEMANTIUS_BACKEND_REF ?? 'origin/main'
const backendFile = 'apps/test/tests/0100_test_jsonlogic.json'
// `.git` is a directory in a clone and a file in a worktree.
const backendFound = existsSync(resolve(backendDir, '.git'))
const backendCorpus = JSON.parse(readFileSync(vendoredPath, 'utf8')) as unknown[]

describe('the vendored backend test cases', () => {
  const required = process.env.SEMANTIUS_BACKEND_REQUIRED === '1'
  it.skipIf(!backendFound && !required)(`match the backend at ${backendRef} (refresh: node scripts/vendor-semantius.mjs)`, () => {
    expect(backendFound, `no semantius clone at ${backendDir}`).toBe(true)
    const committed = execFileSync('git', ['-C', backendDir, 'show', `${backendRef}:${backendFile}`], { encoding: 'utf8' })
    expect(backendCorpus).toEqual(JSON.parse(committed))
  })
})

// The answers the backend is held to, read from its own fixture so the two cannot
// drift. Every case runs here, so a case the backend adds that the browser answers
// differently fails until the browser matches.
const corpusCases = backendCorpus.filter(
  (entry): entry is [unknown, Record<string, unknown>, unknown] => Array.isArray(entry),
)

describe('every backend test case gives the answer the backend gives', () => {
  it('finds the backend fixture', () => {
    expect(corpusCases.length).toBeGreaterThan(500)
  })

  it.each(corpusCases)('%j with %j', (rule, data, expected) => {
    expect(applyJsonLogic(rule, data)).toEqual(expected)
  })
})

describe('substr and missing_some refuse what the backend refuses', () => {
  // The SQLSTATE and message evaluate_json_logic raises for the same rule (postgres18-ext).
  it.each([
    [{ substr: ['abcdef', 3000000000] }, '22003', 'integer out of range'],
    [{ missing_some: [1, 'a'] }, '22023', 'cannot get array length of a scalar'],
    [{ missing_some: [1, { a: 1, b: 2 }] }, '22023', 'cannot get array length of a non-array'],
  ])('%j raises %s', (rule, code, message) => {
    expect(thrown(() => applyJsonLogic(rule, {}))).toMatchObject({ code, message })
  })
})

describe('let and set_record read their name and id as the backend does', () => {
  // Every expected value is what evaluate_json_logic answers (postgres18-ext).
  it('refuses a null name with the SQLSTATE the backend raises', () => {
    expect(thrown(() => applyJsonLogic({ let: [null, 1, 2] }, {}))).toMatchObject({
      code: '22023',
      message: 'argument 1: key must not be null',
    })
  })

  it('names a binding that is not text by its jsonb text', () => {
    expect(applyJsonLogic({ let: [[1, 2], 5, { var: '' }] }, {})).toEqual({ '[1, 2]': 5 })
    expect(applyJsonLogic({ let: [{ b: 1, a: 2 }, 5, { var: '' }] }, {})).toEqual({ '{"a": 2, "b": 1}': 5 })
  })

  it("looks a row up by the id's text, so a list is not read as the number in it", () => {
    const rows = lookup({ 'products:5': { product_name: 'Chai' } })
    expect(applyJsonLogic({ set_record: ['r', 'products', 5, { var: 'r.product_name' }] }, {}, rows)).toBe('Chai')
    expect(applyJsonLogic({ set_record: ['r', 'products', [5], { var: 'r.product_name' }] }, {}, rows)).toBeNull()
  })
})


describe('date operators refuse what the backend refuses', () => {
  it.each([
    [{ date_add: ['today', 1, 'day'] }],
    [{ date_add: ['infinity', 1, 'day'] }],
    [{ date_part: ['J2461406', 'year'] }],
    [{ to_date: ['01/02/2026'] }],
    [{ date_add: [5, 1, 'day'] }],
    [{ date_add: ['2026-02-30', 1, 'day'] }],
    [{ date_add: ['2026-01-01', 1, 'fortnight'] }],
    [{ date_add: ['2026-01-01', 30] }],
    [{ date_add: ['2026-01-01', 1, 'hour'] }],
    [{ date_add: ['2026-01-01', 'PT1H'] }],
    [{ date_trunc: ['2026-01-01', 'minute'] }],
    [{ date_part: ['2026-01-01', 'hour'] }],
    [{ date_part: ['2026-01-01', 'century'] }],
    [{ date_diff: ['2026-01-02', '2026-01-01', 'fortnight'] }],
    [{ date_format: ['2026-01-01', 'TMMon'] }],
    [{ date_format: ['2026-01-01', 'YYYY foo'] }],
    [{ date_format: ['2026-01-01', 'HH24:MI'] }],
    [{ date_format: ['2026-01-01', null] }],
    [{ date_format: ['2026-01-01', ''] }],
    [{ date_add: ['2026-01-01', 1.5, 'day'] }],
    [{ date_add: ['2026-01-01', 'abc', 'day'] }],
    [{ date_add: ['2026-01-01', 'P'] }],
    [{ date_add: ['2026-01-01', 'PT'] }],
    [{ date_add: ['2026-01-01', 'P1DT'] }],
    [{ date_add: ['2026-01-01', '1 day'] }],
    [{ date_add: ['2026-01-01', '-P1D'] }],
    [{ date_add: ['2026-01-01', 'P1.5D'] }],
    [{ date_add: ['0000-01-01', 1, 'day'] }],
    [{ date_add: ['2026-01-01T00:00:00+16:00', 1, 'day'] }],
  ])('%j', (rule) => {
    expect(() => applyJsonLogic(rule, {})).toThrow()
  })

  // What PostgreSQL's timestamp cast accepts at its edges, which the backend reads through.
  it.each([
    [{ date_add: ['2026-01-01T24:00', 1, 'day'] }, '2026-01-03T00:00:00+00:00'],
    [{ date_part: ['2026-01-01T12:59:60', 'minute'] }, 0],
    [{ date_trunc: ['2026-01-01T23:59:59.9999999', 'day'] }, '2026-01-02T00:00:00+00:00'],
    [{ to_date: ['2026-01-01T24:00:00'] }, '2026-01-02'],
    [{ date_add: ['2026-01-01T00:00:00+15:59', 1, 'hour'] }, '2025-12-31T09:01:00+00:00'],
  ])('%j gives %j, as the backend does', (rule, expected) => {
    expect(applyJsonLogic(rule, {})).toBe(expected)
  })

  it('leaves the field unchanged, because the form catches the refusal', () => {
    expect(evaluateComputedFields([{ name: 'due', jsonlogic: { date_add: ['today', 1, 'day'] } }], {})).toEqual({})
  })
})

describe('arithmetic refuses a result that is not a finite number, as the backend does', () => {
  it.each([
    [{ '/': [1, 0] }],
    [{ '%': [1, 0] }],
    [{ '/': [0, 0] }],
    [{ '+': ['Infinity', 1] }],
    [{ '-': ['Infinity', 1] }],
    [{ '*': ['Infinity', 2] }],
    [{ max: ['Infinity', 1] }],
    [{ min: ['-Infinity', 1] }],
  ])('%j', (rule) => {
    expect(() => applyJsonLogic(rule, {})).toThrow()
  })

  it('names the code the backend raises', () => {
    expect(thrown(() => applyJsonLogic({ '/': [1, 0] }, {}))).toEqual({ code: '90920', message: '${operator} has no finite result', params: { operator: '/' } })
  })

  it.each([
    [{ '/': [4, 2] }, 2],
    [{ '/': [2, 4] }, 0.5],
    [{ '%': [3, 2] }, 1],
    [{ '+': [1, '2'] }, 3],
    [{ '*': [2, 2, 2] }, 8],
    [{ '-': [5] }, -5],
    [{ max: [1, 2, 3] }, 3],
    [{ min: [1, 2, 3] }, 1],
  ])('%j still gives %j', (rule, expected) => {
    expect(applyJsonLogic(rule, {})).toBe(expected)
  })

  it('leaves the field unchanged, because the form catches the refusal', () => {
    expect(
      evaluateComputedFields([{ name: 'ratio', jsonlogic: { '/': [{ var: 'a' }, { var: 'b' }] } }], { a: 1, b: 0 }),
    ).toEqual({})
  })
})

describe('arithmetic reads an operand as the backend does', () => {
  const OPERATORS = ['+', '-', '*', '/', '%', 'max', 'min']

  it.each(OPERATORS)('%s refuses text that is no number', (operator) => {
    expect(thrown(() => applyJsonLogic({ [operator]: ['abc', 1] }, {}))).toMatchObject({ code: '90920', params: { operator } })
    expect(thrown(() => applyJsonLogic({ [operator]: [1, 'abc'] }, {}))).toMatchObject({ code: '90920', params: { operator } })
  })

  it.each(OPERATORS)('%s refuses text that only starts with a number', (operator) => {
    expect(thrown(() => applyJsonLogic({ [operator]: ['12abc', 1] }, {}))).toMatchObject({ code: '90920', params: { operator } })
  })

  it.each([
    [{ '+': [null, 1] }, 1],
    [{ '+': ['', 1] }, 1],
    [{ '+': ['  ', 1] }, 1],
    [{ '+': [{ var: 'missing' }, 1] }, 1],
    [{ '-': [5, null] }, 5],
    [{ '-': ['', 5] }, -5],
    [{ '*': [null, 5] }, 0],
    [{ '*': [5, ''] }, 0],
    [{ '/': [null, 5] }, 0],
    [{ '/': ['', 5] }, 0],
    [{ '%': [null, 5] }, 0],
    [{ '%': ['', 5] }, 0],
    [{ max: [null, -1] }, 0],
    [{ max: ['', -1] }, 0],
    [{ min: [null, 1] }, 0],
    [{ min: ['', 1] }, 0],
  ])('%j counts null and blank text as 0 and gives %j', (rule, expected) => {
    expect(applyJsonLogic(rule, {})).toBe(expected)
  })

  it.each([
    [{ '+': ['1.5', '2'] }, 3.5],
    [{ '-': ['5', '2'] }, 3],
    [{ '*': ['3', '4'] }, 12],
    [{ '/': ['6', '3'] }, 2],
    [{ '%': ['7', '4'] }, 3],
    [{ max: ['2', '10'] }, 10],
    [{ min: ['2', '10'] }, 2],
    [{ '+': [' 12 ', 1] }, 13],
    [{ '+': ['1e2', 1] }, 101],
    [{ '+': ['0x10', '0o17', '0b11'] }, 34],
  ])('%j computes with the number the text carries and gives %j', (rule, expected) => {
    expect(applyJsonLogic(rule, {})).toBe(expected)
  })

  it.each([[{ '+': ['-0x10', 1] }], [{ '+': ['1e999', 1] }], [{ '*': ['abc'] }]])('%j is refused', (rule) => {
    expect(thrown(() => applyJsonLogic(rule, {}))).toMatchObject({ code: '90920' })
  })

  it.each([
    [{ '+': [[1, 2], 3] }, {}, 3],
    [{ '+': [[5], 1] }, {}, 1],
    [{ '+': [[], 1] }, {}, 1],
    [{ '+': [{ var: 'o' }, 1] }, { o: { a: 1 } }, 1],
    [{ '*': [{ var: 'o' }, 5] }, { o: [2] }, 0],
  ])('%j counts an array or an object as 0', (rule, data, expected) => {
    expect(applyJsonLogic(rule, data)).toBe(expected)
  })

  it.each([
    [{ '+': ['2026-01-01', 1] }, 1767225601],
    [{ '-': ['2026-01-02', '2026-01-01'] }, 86400],
    [{ '-': ['2026-01-01 10:00', '2026-01-01'] }, 36000],
    [{ '-': ['2026-01-01T10:00:30', '2026-01-01'] }, 36030],
    [{ '-': ['2026-01-01T01:00:00+01:00', '2026-01-01'] }, 0],
    [{ '-': ['2026-01-01T00:00:00-0230', '2026-01-01'] }, 9000],
    [{ '-': ['2026-01-01T00:00:00Z', '2026-01-01'] }, 0],
    [{ '-': ['2026-01-01T00:00:00.5Z', '2026-01-01'] }, 0.5],
    [{ '-': ['2024-03-01', '2024-02-28'] }, 2 * 86400],
    [{ '-': ['2000-02-29', '2000-02-28'] }, 86400],
    // The limits of PostgreSQL's timestamp cast, which the backend reads through.
    [{ '-': ['2026-01-01T24:00', '2026-01-02'] }, 0],
    [{ '-': ['2026-01-01T24:00:00.0', '2026-01-02'] }, 0],
    [{ '-': ['2026-01-01T12:59:60', '2026-01-01T13:00'] }, 0],
    [{ '-': ['2026-01-01T23:59:59.9999999', '2026-01-02'] }, 0],
    [{ '-': ['2026-01-01T00:00:00+15:59', '2026-01-01'] }, -57540],
    [{ '-': ['2026-01-01T00:00:00+05', '2026-01-01'] }, -18000],
    [{ '+': ['0001-01-01', 0] }, -62135596800],
  ])('%j reads ISO date text as its UTC epoch seconds and gives %j', (rule, expected) => {
    expect(applyJsonLogic(rule, {})).toBe(expected)
  })

  it('rounds a fraction to microseconds, as PostgreSQL stores it', () => {
    // The server's numeric is exact. A double at epoch magnitude carries about seven
    // decimal places, so the browser's value is the same to the microsecond.
    expect(applyJsonLogic({ '-': ['2026-01-01T00:00:00.1234567', '2026-01-01'] }, {})).toBeCloseTo(0.123457, 6)
  })

  it.each([
    [{ '+': ['2026-02-30', 1] }],
    [{ '+': ['2025-02-29', 1] }],
    [{ '+': ['1900-02-29', 1] }],
    [{ '+': ['2026-13-01', 1] }],
    [{ '+': ['0000-01-01', 1] }],
    [{ '+': ['2026-01-01T24:00:01', 1] }],
    [{ '+': ['2026-01-01T24:00:00.000001', 1] }],
    [{ '+': ['2026-01-01T10:60', 1] }],
    [{ '+': ['2026-01-01T23:59:61', 1] }],
    [{ '+': ['2026-01-01T23:59:60.5', 1] }],
    [{ '+': ['2026-01-01T00:00:00+16:00', 1] }],
    [{ '+': ['2026-01-01T00:00:00+05:99', 1] }],
    [{ '+': ['2026-01-01x', 1] }],
    [{ '+': [' 2026-01-01', 1] }],
    [{ '+': ['2026-1-01', 1] }],
  ])('%j refuses date text that names no date', (rule) => {
    expect(thrown(() => applyJsonLogic(rule, {}))).toMatchObject({ code: '90920', params: { operator: '+' } })
  })

  it('computes a field from an input left empty, and leaves it unchanged for a mistyped one', () => {
    const entries = [{ name: 'amount', jsonlogic: amountRule }]
    expect(evaluateComputedFields(entries, { quantity: '', unit_price: 10, discount: null })).toEqual({ amount: 0 })
    expect(evaluateComputedFields(entries, { quantity: '2x', unit_price: 10, discount: 0 })).toEqual({})
  })

  it('computes a field from two date inputs', () => {
    const entries = [{ name: 'seconds', jsonlogic: { '-': [{ var: 'ends_on' }, { var: 'starts_on' }] } }]
    expect(evaluateComputedFields(entries, { starts_on: '2026-01-01', ends_on: '2026-01-08' })).toEqual({ seconds: 7 * 86400 })
  })
})

describe('ordering reads its operands as the backend does', () => {
  it.each([
    [{ '>=': ['2026-01-01', 0] }, true],
    [{ '<': ['2026-01-01', 1767225601] }, true],
    [{ '<': [1767225599, '2026-01-01T00:00:00Z'] }, true],
    [{ '>': ['2026-01-01T01:00:00+01:00', 1767225599] }, true],
    [{ '<': ['2026-02-30', 1e12] }, false],
    [{ '>': ['2026-02-30', -1] }, false],
    [{ '<': [[5], 1] }, true],
    [{ '>': [[5], 1] }, false],
    [{ '<': [{ var: 'o' }, 1] }, true],
    [{ '<': [true, 2] }, true],
    [{ '>': [false, -1] }, true],
    [{ '<': [1, 2, null] }, false],
    [{ '<=': [0, null, 0] }, true],
    [{ '>': [3, 2, 9] }, true],
  ])('%j gives %j', (rule, expected) => {
    expect(applyJsonLogic(rule, { o: { a: 1 } })).toBe(expected)
  })

  it('compares two date strings as text, as the backend does', () => {
    expect(applyJsonLogic({ '<': ['2026-01-01T00:00:00Z', '2026-01-01'] }, {})).toBe(false)
    expect(applyJsonLogic({ '<': ['2026-01-01', '2026-01-02'] }, {})).toBe(true)
  })
})

describe('arithmetic on date text is exact to the microsecond, as on the backend', () => {
  // Expected values are what evaluate_json_logic answered (postgres18-ext).
  it.each([
    [{ '-': ['2024-01-01T00:00:00.1234567Z', '2024-01-01'] }, {}, 0.123457],
    [{ '-': ['2024-01-01T00:00:00.123456Z', '2024-01-01'] }, {}, 0.123456],
    [{ '-': ['2024-01-01T00:00:00.000001Z', '2024-01-01T00:00:00Z'] }, {}, 0.000001],
    [{ '+': ['2024-01-01T00:00:00.5Z', 0.25] }, {}, 1704067200.75],
    [{ '+': ['2024-01-01T00:00:00.1234567Z', 86400] }, {}, 1704153600.123457],
    [{ '%': ['2024-01-01T00:00:00.7Z', 1] }, {}, 0.7],
    [{ max: ['2024-01-01T00:00:00.1234567Z', 0] }, {}, 1704067200.123457],
    [{ '-': [{ var: 'a' }, { var: 'b' }] }, { a: '2026-03-01T12:00:00.3333333+01:00', b: '2026-03-01' }, 39600.333333],
  ])('%j with %j is %j', (rule, data, expected) => {
    expect(applyJsonLogic(rule, data)).toBe(expected)
  })

  it('leaves arithmetic without date text alone', () => {
    // The server's numeric keeps twenty digits; rounding here would invent a difference.
    expect(applyJsonLogic({ '/': [1, 3] }, {})).toBe(1 / 3)
  })
})

describe('equality decides as the backend decides', () => {
  // Every expected value is what evaluate_json_logic answered for the same rule
  // and data (postgres18-ext). JavaScript's own == and === differ on most of
  // these: an ISO date against its epoch seconds, an array or an object by
  // value, null against a missing argument.
  it.each([
    [{ '==': ['2024-01-01', 1704067200] }, {}, true],
    [{ '==': ['2024-01-01T00:00:00Z', 1704067200] }, {}, true],
    [{ '!=': ['2024-01-01', 1704067200] }, {}, false],
    [{ '==': [{ var: 'd' }, 1704067200] }, { d: '2024-01-01' }, true],
    [{ '==': ['2024-01-01', '2024-01-01T00:00:00Z'] }, {}, false],
    [{ '==': ['abc', 0] }, {}, false],
    [{ '==': ['', 0] }, {}, true],
    [{ '==': ['0x10', 16] }, {}, true],
    [{ '==': [[], 0] }, {}, true],
    [{ '==': [[5], '5'] }, {}, true],
    [{ '==': [[1, 2], '1,2'] }, {}, true],
    [{ '==': [[null], ''] }, {}, true],
    [{ '==': [[1], [1]] }, {}, true],
    [{ '==': [null, 0] }, {}, false],
    [{ '==': [null] }, {}, false],
    [{ '==': [] }, {}, true],
    [{ '!=': [{ var: 'missing' }, null] }, {}, false],
    [{ '==': [true, 1] }, {}, true],
    [{ '==': [true, '1'] }, {}, true],
    [{ '==': [false, 'abc'] }, {}, false],
    [{ '==': [false, []] }, {}, true],
    [{ '===': [[1], [1]] }, {}, true],
    [{ '===': [[1, [2]], [1, [2]]] }, {}, true],
    [{ '===': [1, 1.0] }, {}, true],
    [{ '===': ['1', 1] }, {}, false],
    [{ '===': [null, null] }, {}, true],
    [{ '==': [{ var: 'o' }, { var: 'p' }] }, { o: { a: 1, b: 2 }, p: { b: 2, a: 1 } }, true],
    [{ '!==': [{ var: 'o' }, { var: 'p' }] }, { o: { a: 1, b: 2 }, p: { b: 2, a: 1 } }, false],
    [{ '==': [{ var: 'o' }, '[object Object]'] }, { o: { a: 1 } }, false],
    [{ '===': [{ var: 'o' }, { var: 'p' }] }, { o: { a: [1] }, p: { a: [2] } }, false],
  ])('%j with %j is %j', (rule, data, expected) => {
    expect(applyJsonLogic(rule, data)).toBe(expected)
  })
})

describe('reserved variables', () => {
  afterEach(() => {
    setRuleUser(null)
  })

  it('supplies $today and $now in UTC, in the form the server renders them', () => {
    const before = new Date().toISOString().slice(0, 10)
    const { today, now } = evaluateComputedFields(
      [
        { name: 'today', jsonlogic: { var: '$today' } },
        { name: 'now', jsonlogic: { var: '$now' } },
      ],
      {},
    ) as { today: string; now: string }
    const after = new Date().toISOString().slice(0, 10)

    expect([before, after]).toContain(today)
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?\+00:00$/)
    expect(now.startsWith(today)).toBe(true)
  })

  it('writes $now with its milliseconds, in the form the server writes a timestamp', () => {
    // What to_jsonb(timestamptz) gives for the same moments (postgres18-ext).
    expect(timestampText(new Date('2026-11-20T18:03:21.617Z'))).toBe('2026-11-20T18:03:21.617+00:00')
    expect(timestampText(new Date('2026-11-20T18:03:21.120Z'))).toBe('2026-11-20T18:03:21.12+00:00')
    expect(timestampText(new Date('2026-11-20T18:03:21.000Z'))).toBe('2026-11-20T18:03:21+00:00')
  })

  it('supplies $user_id from the signed-in user, and null before it is known', () => {
    const entries = [{ name: 'who', jsonlogic: { var: '$user_id' } }]
    expect(evaluateComputedFields(entries, {})).toEqual({ who: null })
    setRuleUser({ user_id: 7 })
    expect(evaluateComputedFields(entries, {})).toEqual({ who: 7 })
  })

  it('wins over a field of the same name, as on the server', () => {
    setRuleUser({ user_id: 7 })
    expect(evaluateComputedFields([{ name: 'who', jsonlogic: { var: '$user_id' } }], { $user_id: 1 })).toEqual({ who: 7 })
  })

  it('reaches the id rule of a set_record, so the row of the known user is the one asked for', () => {
    setRuleUser({ user_id: 7 })
    const entries = [{ name: 'who', jsonlogic: { set_record: ['u', 'users', { var: '$user_id' }, { var: 'u.name' }] } }]
    const records = lookupFromCache(new Map())

    expect(evaluateComputedFields(entries, {}, records)).toEqual({})
    expect([...records.missing.keys()]).toEqual(['users:7'])
  })
})

describe('has_permission and is_match', () => {
  afterEach(() => {
    setRuleUser(null)
  })

  it('answers has_permission from the signed-in user', () => {
    setRuleUser({ permissions: ['orders:approve'] })
    expect(applyJsonLogic({ has_permission: 'orders:approve' }, {})).toBe(true)
    expect(applyJsonLogic({ has_permission: 'orders:delete' }, {})).toBe(false)
  })

  it('answers false before the user is known', () => {
    expect(applyJsonLogic({ has_permission: 'orders:approve' }, {})).toBe(false)
  })

  it('tests is_match', () => {
    expect(applyJsonLogic({ is_match: [{ var: 'code' }, '^A'] }, { code: 'ABC' })).toBe(true)
    expect(applyJsonLogic({ is_match: [{ var: 'code' }, '^B'] }, { code: 'ABC' })).toBe(false)
  })

  it('never matches a null value, even with a pattern that matches the empty string', () => {
    expect(applyJsonLogic({ is_match: [null, '^$'] }, {})).toBe(false)
  })

  it('says that an operator which reads the database cannot run in the browser', () => {
    for (const rule of [
      { is_raci_actor: ['orders', 'approved', 'accountable'] },
      { has_consultation: ['orders', 'approved', { var: 'id' }] },
    ]) {
      const operator = Object.keys(rule)[0]
      expect(() => applyJsonLogic(rule, { id: 1 })).toThrow(
        expect.objectContaining({ envelope: { message: '{operator} cannot run in the browser.', values: { operator } } }),
      )
    }
  })
})

describe('the operators that read beyond the record work as the backend does', () => {
  afterEach(() => {
    setRuleUser(null)
  })

  it('value_changed is true for a new record, which has no $old', () => {
    expect(applyJsonLogic({ value_changed: 'status' }, { status: 'open' })).toBe(true)
    expect(applyJsonLogic({ value_changed: 'status' }, { status: 'open', $old: null })).toBe(true)
  })

  it.each([
    [{ status: 'open' }, { status: 'open' }, false],
    [{ status: 'open' }, { status: 'done' }, true],
    [{ status: null }, { status: null }, false],
    // A field missing on one side differs from one that is null (IS DISTINCT FROM).
    [{}, { status: null }, true],
    [{}, {}, false],
    [{ tags: ['a', 'b'] }, { tags: ['a', 'b'] }, false],
    [{ shape: { a: 1, b: 2 } }, { shape: { b: 2, a: 1 } }, false],
    [{ amount: 1 }, { amount: 1.0 }, false],
  ])('value_changed with $old %j and the record %j is %j', (old, record, expected) => {
    const field = Object.keys({ ...old, ...record })[0] ?? 'status'
    expect(applyJsonLogic({ value_changed: field }, { ...record, $old: old })).toBe(expected)
  })

  it('require_permission is true with the permission', () => {
    setRuleUser({ permissions: ['orders:approve'] })
    expect(applyJsonLogic({ require_permission: 'orders:approve' }, {})).toBe(true)
  })

  it('require_permission without it raises what rbac.require_permission raises', () => {
    setRuleUser({ permissions: [] })
    expect(thrown(() => applyJsonLogic({ require_permission: 'orders:approve' }, {}))).toEqual({
      code: '42501',
      message: 'Permission denied: ${permission} required',
      params: { code: '90101', hint: 'Ask an administrator to grant ${permission}', permission: 'orders:approve' },
    })
  })

  // Every expected value is what evaluate_json_logic raised for the same rule (postgres18-ext).
  it.each([
    [{ throw_error: ['Order ${id} is already shipped', '99017', ['id', 7]] }, '99017', 'Order ${id} is already shipped', { id: 7 }],
    [{ throw_error: 'Plain' }, '99000', 'Plain', {}],
    [{ throw_error: ['x', '12345'] }, '90911', 'throw_error code must be a class 99 number, not ${code_given}', { code_given: '12345' }],
    [{ throw_error: ['x', '99001', ['a']] }, '90914', 'throw_error parameters must be a flat list of name and value pairs', undefined],
    [{ throw_error: ['x', '99001', ['entity', 1]] }, '90912', 'throw_error parameter ${name} uses a reserved name', { name: 'entity' }],
    [{ throw_error: ['x', '99001', ['a', [1]]] }, '90913', 'throw_error parameter ${name} must be a scalar value, not ${json_type}', { name: 'a', json_type: 'array' }],
  ])('throw_error %j raises %s', (rule, code, message, params) => {
    expect(thrown(() => applyJsonLogic(rule, {}))).toEqual({ code, message, params })
  })

  it('throw_error evaluates its parameters, keeping their JSON type', () => {
    expect(thrown(() => applyJsonLogic({ throw_error: ['${n} left', '99002', ['n', { var: 'n' }]] }, { n: 3 }))).toMatchObject({
      params: { n: 3 },
    })
  })
})

describe('a date operator refuses with the error the backend raises', () => {
  // Every expected value is what evaluate_json_logic raised for the same rule (postgres18-ext).
  it.each([
    [{ date_add: ['2026-02-30', 1, 'day'] }, '22008', 'date/time field value out of range: "2026-02-30"', undefined],
    [{ date_add: ['today', 1, 'day'] }, '90915', '${operator} needs an ISO 8601 date or date-time, not ${value}', { operator: 'date_add', value: 'today' }],
    [{ date_add: ['2026-01-01', 1, 'fortnight'] }, '90916', '${operator} cannot use ${unit} on this value', { operator: 'date_add', unit: 'fortnight' }],
    [{ date_add: ['2026-01-01', 30] }, '90916', '${operator} cannot use ${unit} on this value', { operator: 'date_add', unit: null }],
    [{ date_format: ['2026-01-01', 'TMMon'] }, '90917', '${operator} cannot use the pattern ${pattern}', { operator: 'date_format', pattern: 'TMMon' }],
    [{ date_add: ['2026-01-01', 1.5, 'day'] }, '90918', '${operator} needs a whole number or an ISO 8601 duration, not ${value}', { operator: 'date_add', value: 1.5 }],
  ])('%j raises %s', (rule, code, message, params) => {
    expect(thrown(() => applyJsonLogic(rule, {}))).toEqual({ code, message, params })
  })
})

describe('computed fields get $old and $mode, as the backend gives them', () => {
  const entries = [
    { name: 'changed', jsonlogic: { value_changed: 'status' } },
    { name: 'mode', jsonlogic: { var: '$mode' } },
    { name: 'was', jsonlogic: { var: '$old.status' } },
  ]

  it('on an insert: no $old', () => {
    expect(evaluateComputedFields(entries, { status: 'open' }, undefined, { record: { old: null, mode: 'insert' } })).toEqual({
      changed: true,
      mode: 'insert',
      was: null,
    })
  })

  it('on an update: the stored row', () => {
    const record = { old: { status: 'open' }, mode: 'update' } as const
    expect(evaluateComputedFields(entries, { status: 'open' }, undefined, { record })).toEqual({ changed: false, mode: 'update', was: 'open' })
    expect(evaluateComputedFields(entries, { status: 'done' }, undefined, { record })).toEqual({ changed: true, mode: 'update', was: 'open' })
  })

  it('reports a rule that throws, and leaves its field', () => {
    const errors: Record<string, unknown> = {}
    const updates = evaluateComputedFields([{ name: 'ratio', jsonlogic: { '/': [1, 0] } }], {}, undefined, {
      onError: (name, error) => {
        errors[name] = error
      },
    })
    expect(updates).toEqual({})
    expect(thrown(() => {
      throw errors.ratio
    })).toMatchObject({ code: '90920' })
  })
})

describe('idColumnForEntity', () => {
  it('reads the id column off the reference field that points at the entity', () => {
    expect(
      idColumnForEntity(
        {
          product_id: { reference_table: 'products', reference_table_id_column: 'product_id' },
        },
        'products',
      ),
    ).toBe('product_id')
  })

  it('defaults to id', () => {
    expect(idColumnForEntity(undefined, 'products')).toBe('id')
    expect(idColumnForEntity({ name: { reference_table: 'suppliers' } }, 'products')).toBe('id')
  })
})
