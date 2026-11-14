/**
 * Grid filter search-param encode/decode.
 *
 * TanStack Router JSON-parses values that are valid JSON. A drill-down href
 * writes `filters=[{...}]`, which arrives here as an array. The grid's own
 * navigate() JSON-encodes the already-stringified array, so the param is a
 * string that still needs one (sometimes two) JSON.parse. Treat all three
 * shapes as the same list — otherwise a valid filter URL is wiped on load.
 */

export type GridFilter = {
  id: string
  value: string | string[]
  variant: string
  operator: string
  joinOperator?: string
  filterId?: string
}

export function parseFiltersFromURL(filtersParam: unknown): GridFilter[] {
  if (filtersParam == null || filtersParam === '') return []
  try {
    let parsed: unknown = filtersParam
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed)
      if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    }
    if (!Array.isArray(parsed)) return []
    return parsed.map((filter: GridFilter, i: number) => ({
      ...filter,
      filterId: filter.filterId ?? `url-filter-${filter.id}-${filter.operator}-${i}`,
    }))
  } catch {
    return []
  }
}

export function serializeFiltersForURL(filters: GridFilter[]): string | undefined {
  if (filters.length === 0) return undefined
  return JSON.stringify(filters.map(({ filterId: _id, ...rest }) => rest))
}
