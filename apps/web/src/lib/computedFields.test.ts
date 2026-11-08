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

// The answers the backend is held to, read from its own fixture so the two cannot drift.
const backendDateCases = (existsSync(fixturePath) ? (JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]) : []).filter(
  (entry): entry is [Record<string, unknown>, Record<string, unknown>, unknown] =>
    Array.isArray(entry) && DATE_OPERATORS.has(Object.keys(entry[0] ?? {})[0] ?? ''),
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
  ])('%j', (rule) => {
    expect(() => applyJsonLogic(rule, {})).toThrow()
  })

  it('leaves the field unchanged, because the form catches the refusal', () => {
    expect(evaluateComputedFields([{ name: 'due', jsonlogic: { date_add: ['today', 1, 'day'] } }], {})).toEqual({})
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
