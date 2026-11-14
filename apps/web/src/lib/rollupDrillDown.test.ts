import { describe, expect, it } from 'vitest'
import {
  gridPageSizeForHeight,
  parseRollupLinkField,
  rollupDrillDownHref,
  rollupExpressionOf,
  rollupLinkedEntity,
} from './rollupDrillDown'

const interviewCount = {
  ctype: 'rollup',
  rollup: {
    function: 'count',
    link_field: 'interviews.application_id',
    include_hidden_rows: true,
  },
}

describe('parseRollupLinkField', () => {
  it('splits a table.column link_field', () => {
    expect(parseRollupLinkField('interviews.application_id')).toEqual({
      table: 'interviews',
      column: 'application_id',
    })
  })

  it('rejects a missing table, a missing column, or extra dots', () => {
    expect(parseRollupLinkField('interviews')).toBeUndefined()
    expect(parseRollupLinkField('.application_id')).toBeUndefined()
    expect(parseRollupLinkField('interviews.')).toBeUndefined()
    expect(parseRollupLinkField('a.b.c')).toBeUndefined()
    expect(parseRollupLinkField(null)).toBeUndefined()
  })
})

describe('rollupExpressionOf', () => {
  it('reads the rollup object only on ctype rollup', () => {
    expect(rollupExpressionOf(interviewCount)?.link_field).toBe('interviews.application_id')
    expect(rollupExpressionOf({ ctype: 'computed', rollup: interviewCount.rollup })).toBeUndefined()
    expect(rollupExpressionOf({ ctype: 'rollup' })).toBeUndefined()
  })
})

describe('gridPageSizeForHeight', () => {
  it('matches the grid breakpoints', () => {
    expect(gridPageSizeForHeight(800)).toBe(10)
    expect(gridPageSizeForHeight(1071)).toBe(15)
    expect(gridPageSizeForHeight(1331)).toBe(20)
  })
})

describe('rollupLinkedEntity', () => {
  it('reads the child plural whose id is the link_field', () => {
    expect(
      rollupLinkedEntity(interviewCount, [
        { id: 'offers.application_id', plural_label: 'Offers' },
        { id: 'interviews.application_id', plural_label: 'Interviews' },
      ]),
    ).toEqual({ table: 'interviews', plural: 'Interviews' })
  })

  it('omits the plural when that child is missing', () => {
    expect(rollupLinkedEntity(interviewCount, [])).toEqual({
      table: 'interviews',
      plural: undefined,
    })
  })
})

describe('rollupDrillDownHref', () => {
  it('builds the filtered interviews grid URL for an application rollup', () => {
    const href = rollupDrillDownHref({
      property: interviewCount,
      moduleSlug: 'applicant-tracking',
      recordId: 9,
      pageSize: 15,
    })
    expect(href).toBeDefined()
    const url = new URL(href!, 'https://example.test')
    expect(url.pathname).toBe('/applicant-tracking/interviews')
    expect(url.searchParams.get('page')).toBe('1')
    expect(url.searchParams.get('pageSize')).toBe('15')
    expect(url.searchParams.get('sortBy')).toBe('id')
    expect(url.searchParams.get('sortOrder')).toBe('desc')
    expect(JSON.parse(url.searchParams.get('filters')!)).toEqual([
      {
        id: 'application_id',
        value: '9',
        variant: 'select',
        operator: 'eq',
        joinOperator: 'and',
      },
    ])
  })

  it('stringifies a text row id the same way', () => {
    const href = rollupDrillDownHref({
      property: {
        ctype: 'rollup',
        rollup: { function: 'count', link_field: 'roles.module_id' },
      },
      moduleSlug: 'admin',
      recordId: 'mod_1',
      pageSize: 10,
    })
    const filters = JSON.parse(new URL(href!, 'https://example.test').searchParams.get('filters')!)
    expect(filters[0].value).toBe('mod_1')
  })

  it('is absent without a module, a row, or a link_field', () => {
    const base = {
      property: interviewCount,
      moduleSlug: 'applicant-tracking',
      recordId: 9,
      pageSize: 15,
    }
    expect(rollupDrillDownHref({ ...base, moduleSlug: undefined })).toBeUndefined()
    expect(rollupDrillDownHref({ ...base, recordId: null })).toBeUndefined()
    expect(rollupDrillDownHref({ ...base, recordId: '' })).toBeUndefined()
    expect(
      rollupDrillDownHref({ ...base, property: { ctype: 'rollup', rollup: { function: 'count' } } }),
    ).toBeUndefined()
    expect(
      rollupDrillDownHref({
        ...base,
        property: { ctype: 'computed', rollup: interviewCount.rollup },
      }),
    ).toBeUndefined()
  })
})
