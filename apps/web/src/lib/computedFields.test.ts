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

// The backend's own JsonLogic test cases, committed at vendor/semantius/ so they
// run in CI and before a release, where there is no backend checkout. Where
// there is one, the copy must match it; `node scripts/vendor-semantius.mjs`
// refreshes it.
// src/lib -> src -> web -> apps -> repository root
const vendoredPath = resolve(__dirname, '../../../../vendor/semantius/0100_test_jsonlogic.json')
// ... -> its parent
const backendDir = process.env.SEMANTIUS_BACKEND_DIR ?? resolve(__dirname, '../../../../../semantius')
const backendPath = resolve(backendDir, 'apps/test/tests/0100_test_jsonlogic.json')
const DATE_OPERATORS = new Set(['date_add', 'date_diff', 'date_part', 'date_trunc', 'to_date', 'date_format'])
const NUMBER_OPERATORS = new Set(['+', '-', '*', '/', '%', 'max', 'min', '<', '<=', '>', '>=', '==', '!=', '===', '!=='])
const backendCorpus = JSON.parse(readFileSync(vendoredPath, 'utf8')) as unknown[]

describe('the vendored backend test cases', () => {
  const required = process.env.SEMANTIUS_BACKEND_REQUIRED === '1'
  it.skipIf(!existsSync(backendPath) && !required)('match the backend checkout (refresh: node scripts/vendor-semantius.mjs)', () => {
    expect(existsSync(backendPath), `no semantius checkout at ${backendDir}`).toBe(true)
    expect(backendCorpus).toEqual(JSON.parse(readFileSync(backendPath, 'utf8')))
  })
})

// The answers the backend is held to, read from its own fixture so the two cannot drift.
function backendCases(operators: Set<string>) {
  return backendCorpus.filter(
    (entry): entry is [Record<string, unknown>, Record<string, unknown>, unknown] =>
      Array.isArray(entry) && operators.has(Object.keys(entry[0] ?? {})[0] ?? ''),
  )
}

const backendDateCases = backendCases(DATE_OPERATORS)
const backendNumberCases = backendCases(NUMBER_OPERATORS)

describe('arithmetic, ordering and equality give the answers the backend gives', () => {
  it('finds the backend fixture', () => {
    expect(backendNumberCases.length).toBeGreaterThan(50)
  })

  it.each(backendNumberCases)('%j', (rule, data, expected) => {
    expect(applyJsonLogic(rule, data)).toEqual(expected)
  })
})

describe('date operators give the answers the backend gives', () => {
  it('finds the backend fixture', () => {
    expect(backendDateCases.length).toBeGreaterThan(100)
  })

  it.each(backendDateCases)('%j', (rule, data, expected) => {
    expect(applyJsonLogic(rule, data)).toEqual(expected)
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
