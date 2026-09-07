import { describe, expect, it } from 'vitest'
import { extract, placeholdersOf as extractorPlaceholdersOf } from '../../scripts/i18n/extract.mjs'
import { compileError, placeholderDiff, placeholdersOf } from './placeholders'

/**
 * The in-app placeholder check against the extractor's.
 *
 * Translate mode holds a typed translation to the rule `import.mjs` and the
 * catalog test apply — and it cannot import the script, so the walk is written
 * twice. This is what keeps the two from drifting: the whole index, both ways.
 */
describe('placeholdersOf', () => {
  it('agrees with the extractor over every message in the index', () => {
    const { index } = extract()
    expect(Object.keys(index.index).length).toBeGreaterThan(20)
    for (const [id, entry] of Object.entries(index.index)) {
      expect(placeholdersOf(entry.message), id).toEqual(entry.placeholders)
      expect(placeholdersOf(entry.message), id).toEqual(extractorPlaceholdersOf(entry.message))
    }
  })

  it('walks into plural and select branches', () => {
    expect(placeholdersOf('{count, plural, one {# {label}} other {# {labels}}}')).toEqual([
      'count',
      'label',
      'labels',
    ])
  })

  it('throws on a message that does not compile', () => {
    expect(() => placeholdersOf('{count, plural, one {# row}')).toThrow()
  })
})

describe('placeholderDiff', () => {
  it('is null when the translation keeps every placeholder', () => {
    expect(placeholderDiff('Delete {label}?', '{label} löschen?')).toBeNull()
  })

  it('names what was dropped and what was invented', () => {
    expect(placeholderDiff('Delete {label}?', '{name} löschen?')).toEqual({ missing: ['label'], extra: ['name'] })
  })

  it('stands down for a translation that does not compile — the compile check reports that', () => {
    expect(placeholderDiff('Delete {label}?', '{label löschen?')).toBeNull()
    expect(compileError('{label löschen?')).toEqual(expect.any(String))
    expect(compileError('{label} löschen?')).toBeNull()
  })
})
