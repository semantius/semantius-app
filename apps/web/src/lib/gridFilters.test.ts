import { describe, expect, it } from 'vitest'
import { parseFiltersFromURL, serializeFiltersForURL } from './gridFilters'

const interviewFilter = {
  id: 'application_id',
  value: '9',
  variant: 'select',
  operator: 'eq',
  joinOperator: 'and',
}

describe('parseFiltersFromURL', () => {
  it('reads a JSON array string, as a raw <a href> puts in the URL', () => {
    const parsed = parseFiltersFromURL(JSON.stringify([interviewFilter]))
    expect(parsed).toEqual([{ ...interviewFilter, filterId: 'url-filter-application_id-eq-0' }])
  })

  it('reads an already-parsed array, as TanStack Router hands off valid JSON', () => {
    const parsed = parseFiltersFromURL([interviewFilter])
    expect(parsed[0]).toMatchObject(interviewFilter)
  })

  it('unwraps a double-encoded string, as the grid writes via navigate()', () => {
    const parsed = parseFiltersFromURL(JSON.stringify(JSON.stringify([interviewFilter])))
    expect(parsed[0]).toMatchObject(interviewFilter)
  })

  it('returns nothing for junk', () => {
    expect(parseFiltersFromURL(undefined)).toEqual([])
    expect(parseFiltersFromURL('')).toEqual([])
    expect(parseFiltersFromURL('{')).toEqual([])
    expect(parseFiltersFromURL('{}')).toEqual([])
  })
})

describe('serializeFiltersForURL', () => {
  it('drops filterId so the URL stays short', () => {
    expect(
      serializeFiltersForURL([{ ...interviewFilter, filterId: 'url-filter-application_id-eq-0' }]),
    ).toBe(JSON.stringify([interviewFilter]))
  })
})
