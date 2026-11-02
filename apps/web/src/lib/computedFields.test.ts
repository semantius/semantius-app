import { describe, expect, it } from 'vitest'
import {
  applyJsonLogic,
  collectSetRecordLookups,
  evaluateComputedFields,
  idColumnForEntity,
  parseComputedFields,
  type RecordLookup,
} from './computedFields'

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
