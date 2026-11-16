import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyJsonLogic,
  collectSetRecordLookups,
  evaluateComputedFields,
  idColumnForEntity,
  loadSetRecords,
  parseComputedFields,
  type RecordLookup,
} from './computedFields'
import { setRuleUser } from './ruleContext'

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

function lookup(rows: Record<string, Record<string, unknown>>): RecordLookup {
  return {
    get(entity, id) {
      if (id === null || id === undefined || id === '') return null
      return rows[`${entity}:${String(id)}`] ?? null
    },
    has(entity, id) {
      if (id === null || id === undefined || id === '') return true
      return `${entity}:${String(id)}` in rows
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
})

describe('collectSetRecordLookups', () => {
  it('finds the entity and id expression', () => {
    expect(collectSetRecordLookups(labelRule)).toEqual([
      { entity: 'products', idRule: { var: 'product_id' } },
    ])
  })
})

// src/lib -> src -> web -> apps -> repository root -> its parent
const backendDir = process.env.SEMANTIUS_BACKEND_DIR ?? resolve(__dirname, '../../../../../semantius')
const fixturePath = resolve(backendDir, 'apps/test/tests/0100_test_jsonlogic.json')
const DATE_OPERATORS = new Set(['date_add', 'date_diff', 'date_part', 'date_trunc', 'to_date', 'date_format'])
const NUMBER_OPERATORS = new Set(['+', '-', '*', '/', '%', 'max', 'min', '<', '<=', '>', '>='])
const backendCorpus = existsSync(fixturePath) ? (JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]) : []

// The answers the backend is held to, read from its own fixture so the two cannot drift.
function backendCases(operators: Set<string>) {
  return backendCorpus.filter(
    (entry): entry is [Record<string, unknown>, Record<string, unknown>, unknown] =>
      Array.isArray(entry) && operators.has(Object.keys(entry[0] ?? {})[0] ?? ''),
  )
}

const backendDateCases = backendCases(DATE_OPERATORS)
const backendNumberCases = backendCases(NUMBER_OPERATORS)

describe.skipIf(backendNumberCases.length === 0 && process.env.SEMANTIUS_BACKEND_REQUIRED !== '1')(
  'arithmetic and ordering give the answers the backend gives',
  () => {
    it('finds the backend fixture', () => {
      expect(backendNumberCases.length).toBeGreaterThan(50)
    })

    it.each(backendNumberCases)('%j', (rule, data, expected) => {
      expect(applyJsonLogic(rule, data)).toEqual(expected)
    })
  },
)

describe.skipIf(backendDateCases.length === 0 && process.env.SEMANTIUS_BACKEND_REQUIRED !== '1')(
  'date operators give the answers the backend gives',
  () => {
    it('finds the backend fixture', () => {
      expect(backendDateCases.length).toBeGreaterThan(100)
    })

    it.each(backendDateCases)('%j', (rule, data, expected) => {
      expect(applyJsonLogic(rule, data)).toEqual(expected)
    })
  },
)

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
    expect(() => applyJsonLogic({ '/': [1, 0] }, {})).toThrow(/^90920/)
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
    expect(() => applyJsonLogic({ [operator]: ['abc', 1] }, {})).toThrow(`90920: ${operator} has no finite result`)
    expect(() => applyJsonLogic({ [operator]: [1, 'abc'] }, {})).toThrow(`90920: ${operator} has no finite result`)
  })

  it.each(OPERATORS)('%s refuses text that only starts with a number', (operator) => {
    expect(() => applyJsonLogic({ [operator]: ['12abc', 1] }, {})).toThrow(`90920: ${operator} has no finite result`)
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
    expect(() => applyJsonLogic(rule, {})).toThrow(/^90920/)
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
    expect(() => applyJsonLogic(rule, {})).toThrow('90920: + has no finite result')
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
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/)
    expect(now.startsWith(today)).toBe(true)
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

  it('reaches the id rule of a set_record, so a known user is not cached as "no row"', async () => {
    // Without the context the id reads as null, and a null id is cached as a row
    // that does not exist under a key the later lookup never asks for. With it the
    // id is 7, and the only thing that can reach the cache is the fetched row.
    setRuleUser({ user_id: 7 })
    const entries = [{ name: 'who', jsonlogic: { set_record: ['u', 'users', { var: '$user_id' }, { var: 'u.name' }] } }]
    const cache = new Map<string, Record<string, unknown> | null>()

    await loadSetRecords(entries, {}, cache, () => 'id')

    expect(cache.has('users:null')).toBe(false)
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

  it('still throws for an operator that needs the database', () => {
    expect(() => applyJsonLogic({ value_changed: 'status' }, {})).toThrow()
    expect(() => applyJsonLogic({ is_raci_actor: ['orders', 'approved', 'accountable'] }, {})).toThrow()
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
