import { describe, it, expect } from 'vitest'
import formats from 'sem-schema/formats.json'
import { controls } from './controls'

/**
 * The registry is `Record<FormatName, FormatEntry>`, so `tsc` already refuses a
 * catalog format with no entry. This is the runtime half of the same claim: it
 * catches the case the type cannot, which is an entry that type-checks because
 * of a cast and a table that has drifted from the catalog file on disk.
 *
 * In `node`, not `browser`: nothing here renders, so there is no DOM to need.
 */
describe('format coverage', () => {
  const catalog = Object.keys(formats).sort()
  const registry = Object.keys(controls).sort()

  it('has an entry for every catalog format and no others', () => {
    expect(registry).toEqual(catalog)
  })

  it('gives every entry a control and a width', () => {
    for (const [format, entry] of Object.entries(controls)) {
      expect(entry.control, format).toBeTypeOf('function')
      expect(['s', 'm', 'w'], format).toContain(entry.width)
      expect(entry.gridColumn, format).toBeTypeOf('boolean')
    }
  })

  it('only claims an emptyValue rule it can act on', () => {
    for (const [format, entry] of Object.entries(controls)) {
      if (entry.emptyValue === undefined) continue
      expect(['null', 'default'], format).toContain(entry.emptyValue)
    }
  })

  it("keeps the JSON family out of the grid", () => {
    // The four structured formats are edited as JSON text and are far too large
    // for a cell — the rule the grid and its skeleton both read.
    for (const format of ['json', 'jsonlogic', 'object', 'array'] as const) {
      expect(controls[format].gridColumn, format).toBe(false)
      expect(controls[format].emptyValue, format).toBe('default')
      expect(controls[format].width, format).toBe('w')
    }
  })

  it('sends an empty value as null for every column that rejects an empty string', () => {
    // date/time/date-time/duration are typed columns, uuid is a UUID column and
    // the two binary formats are BYTEA/TEXT holding encoded bytes. PostgREST
    // rejects '' for all of them.
    for (const format of ['date', 'time', 'date-time', 'duration', 'uuid', 'binary', 'byte'] as const) {
      expect(controls[format].emptyValue, format).toBe('null')
    }
  })
})
