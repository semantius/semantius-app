import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  CONTEXT_SEPARATOR,
  buildIndex,
  collectMessages,
  reconcileCatalog,
  serialize,
} from '../../scripts/i18n/extract.mjs'

/**
 * The extractor's contract, exercised against real files on disk.
 *
 * It matters more than most tests here because of what the scheme rests on: the
 * source string IS the key, so a call site the extractor cannot read is a string
 * that can never be translated AND never appears in any report. "It fails on a
 * template with expressions" is therefore a claim that has to be measured, not
 * asserted in a comment — and the interesting half is the FALSE negatives: a
 * concatenation inside one pair of parentheses, or a call expression, both of
 * which an earlier permissive fallthrough waved through in silence.
 *
 * The fixtures are written to a temp directory rather than committed under
 * `src/`, because a file holding `t(cond ? 'a' : 'b')` with no `t` in scope is a
 * type error and a lint error everywhere the repo looks.
 */

let dir: string

/** Write one fixture and hand back its path. */
function fixture(name: string, source: string): string {
  const path = join(dir, name)
  writeFileSync(path, source)
  return path
}

/** The ids the extractor found in `source`, or the error it refused with. */
function extractFrom(source: string, name = 'probe.tsx'): string[] {
  return [...collectMessages([fixture(name, source)]).keys()]
}

function refusalFor(source: string, name = 'probe.tsx'): string {
  try {
    collectMessages([fixture(name, source)])
  } catch (err) {
    return (err as Error).message
  }
  throw new Error(`expected the extractor to refuse:\n${source}`)
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'i18n-extract-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('what the extractor reads', () => {
  it('takes a string literal and a template with no expressions', () => {
    expect(extractFrom("export const a = () => t('Save')")).toEqual(['Save'])
    expect(extractFrom('export const a = () => t(`Save`)')).toEqual(['Save'])
  })

  it('reads every callee the app translates through', () => {
    expect(extractFrom("t('A'); translate('B'); msg('C')")).toEqual(['A', 'B', 'C'])
  })

  it('keys a descriptor with a context by message + U+0004 + context', () => {
    expect(extractFrom("t({ message: 'Right', context: 'direction' })")).toEqual([
      `Right${CONTEXT_SEPARATOR}direction`,
    ])
  })

  it('reads a <Trans id>, so rich text is in the index like everything else', () => {
    expect(extractFrom('export const a = () => <Trans id="Delete <bold>{name}</bold>?" />')).toEqual([
      'Delete <bold>{name}</bold>?',
    ])
  })

  it('merges the origins of one message met in several files, sorted', () => {
    const found = collectMessages([
      fixture('b.tsx', "t('Shared')"),
      fixture('a.tsx', "t('Shared')"),
    ])

    const origins = found.get('Shared')?.origin
    expect([...(origins ?? [])].sort()).toHaveLength(2)
  })
})

describe('what the extractor refuses', () => {
  it('refuses a template literal with an expression', () => {
    expect(refusalFor('const n = 1; t(`Hello ${n}`)')).toMatch(/template literal with expressions/)
  })

  it('refuses a conditional', () => {
    expect(refusalFor("declare const c: boolean; t(c ? 'Yes' : 'No')")).toMatch(/conditional/)
  })

  it('refuses a concatenation', () => {
    expect(refusalFor("declare const n: string; t('Hello ' + n)")).toMatch(/concatenation/)
  })

  it('refuses a concatenation wrapped in parentheses, an `as` or a `!`', () => {
    // The bypass a permissive fallthrough leaves open: nothing in a formatter or
    // a lint rule strips these, so the check has to see through them itself.
    expect(refusalFor("declare const n: string; t(('Hello ' + n))")).toMatch(/concatenation/)
    expect(refusalFor("declare const n: string; t(('Hello ' + n) as string)")).toMatch(/concatenation/)
    expect(refusalFor("declare const n: string; t(('Hello ' + n)!)")).toMatch(/concatenation/)
  })

  it('refuses a call expression and a logical expression', () => {
    // Both used to pass in silence, which is worse than either failing: the
    // string is neither translated nor listed anywhere as untranslated.
    expect(refusalFor('declare function title(): string; t(title())')).toMatch(/cannot read as a message/)
    expect(refusalFor("declare const c: boolean; t(c && 'Yes')")).toMatch(/cannot read as a message/)
  })

  it('refuses a descriptor whose message is not a literal', () => {
    expect(refusalFor('declare const m: string; t({ message: m })')).toMatch(/must be a plain string literal/)
    expect(refusalFor('declare const d: object; t({ ...d })')).toMatch(/no literal "message"/)
  })

  it('names the file and the line, so the complaint is actionable', () => {
    expect(refusalFor("declare const c: boolean; t(c ? 'Yes' : 'No')", 'named.tsx')).toMatch(/named\.tsx:1:29/)
  })

  it('lets an identifier or a member expression through, recording nothing', () => {
    // `t(entry.title)` renders a msg() descriptor extracted at its own
    // declaration site, or an operator's plain string, which belongs in a
    // deployment file rather than in this index.
    expect(extractFrom('declare const entry: { title: string }; t(entry.title)')).toEqual([])
    expect(extractFrom('declare const rows: string[]; t(rows[0])')).toEqual([])
    expect(extractFrom('declare const title: string; t(title)')).toEqual([])
  })
})

describe('the index', () => {
  it('records origins without line numbers and the ICU placeholders', () => {
    const index = buildIndex(collectMessages([fixture('one.tsx', "t('Delete {label}?')")]))

    expect(index.index['Delete {label}?']).toMatchObject({
      message: 'Delete {label}?',
      placeholders: ['label'],
    })
    expect(index.index['Delete {label}?'].origin[0]).not.toMatch(/:\d/)
  })

  it('finds the arguments of a plural, not just the top-level ones', () => {
    const index = buildIndex(
      collectMessages([fixture('two.tsx', "t('{count, plural, one {# {noun}} other {# {noun}s}}')")]),
    )

    expect(Object.values(index.index)[0].placeholders).toEqual(['count', 'noun'])
  })
})

describe('reconciling a catalog', () => {
  const index = { locale: 'en-US', index: { Save: { message: 'Save', origin: [], placeholders: [] } } }

  it('never overwrites an existing translation, and adds a gap for a new key', () => {
    const out = reconcileCatalog({ locale: 'de-DE', name: 'Deutsch', messages: { Save: 'Speichern' } }, index)
    expect(out.messages).toEqual({ Save: 'Speichern' })

    const fresh = reconcileCatalog({ locale: 'de-DE', messages: {} }, index)
    expect(fresh.messages).toEqual({ Save: '' })
  })

  it('moves a removed key to obsolete, and drops it when it held nothing', () => {
    const out = reconcileCatalog(
      { locale: 'de-DE', messages: { Save: 'Speichern', 'Old wording': 'Alt', Never: '' } },
      index,
    )

    expect(out.obsolete?.messages).toEqual({ 'Old wording': 'Alt' })
    expect(out.messages).not.toHaveProperty('Never')
  })

  it('empties obsolete on --prune', () => {
    const out = reconcileCatalog(
      { locale: 'de-DE', messages: { Save: 'Speichern' }, obsolete: { messages: { Old: 'Alt' } } },
      index,
      { prune: true },
    )

    expect(out.obsolete).toBeUndefined()
  })

  it('is idempotent and sorted, so a rerun is a no-op on any machine', () => {
    const messy = { locale: 'de-DE', name: 'Deutsch', messages: { Zebra: 'Zebra', Save: 'Speichern' } }
    const wide = {
      locale: 'en-US',
      index: {
        Save: { message: 'Save', origin: [], placeholders: [] },
        Zebra: { message: 'Zebra', origin: [], placeholders: [] },
      },
    }

    const once = reconcileCatalog(messy, wide)
    const twice = reconcileCatalog(once, wide)

    expect(serialize(twice)).toBe(serialize(once))
    expect(Object.keys(once.messages ?? {})).toEqual(['Save', 'Zebra'])
    expect(serialize(once).endsWith('\n')).toBe(true)
    expect(serialize(once)).not.toContain('\r')
  })
})
