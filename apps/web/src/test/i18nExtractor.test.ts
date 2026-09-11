import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { collectMessages, reconcileIndex, reconcileLanguage, serialize } from '../../scripts/i18n/extract.mjs'

/**
 * The scan's contract, exercised against real files on disk.
 *
 * It is an optional tool, but where it runs it has to be sound: for a code
 * string the source IS the key, so a call site the scan cannot read is a
 * string it cannot prune and cannot report. "It fails on a template with
 * expressions" is therefore a claim that has to be measured, not asserted in a
 * comment — and the interesting half is the FALSE negatives: a concatenation
 * inside one pair of parentheses, or a call expression, both of which an
 * earlier permissive fallthrough waved through in silence.
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

/** The keys the scan found in `source`, or the error it refused with. */
function extractFrom(source: string, name = 'probe.tsx'): string[] {
  return [...collectMessages([fixture(name, source)]).keys()]
}

function refusalFor(source: string, name = 'probe.tsx'): string {
  try {
    collectMessages([fixture(name, source)])
  } catch (err) {
    return (err as Error).message
  }
  throw new Error(`expected the scan to refuse:\n${source}`)
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'i18n-extract-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('what the scan reads', () => {
  it('takes a string literal and a template with no expressions', () => {
    expect(extractFrom("export const a = () => t('Save')")).toEqual(['Save'])
    expect(extractFrom('export const a = () => t(`Save`)')).toEqual(['Save'])
  })

  it('reads every callee the app translates through', () => {
    expect(extractFrom("t('A'); translate('B'); msg('C')")).toEqual(['A', 'B', 'C'])
  })

  it('keys a disambiguated message by its id and message', () => {
    expect(extractFrom("t({ id: ['columnVisibility'], message: 'View' })")).toEqual(['columnVisibility.View'])
    const found = collectMessages([fixture('form2.tsx', "t({ id: ['columnVisibility'], message: 'View' })")])
    expect(found.get('columnVisibility.View')?.source).toBe('View')
  })

  it('skips a keyed message — its inventory is discovery, its source is the model', () => {
    expect(
      extractFrom("declare const p: { title?: string }; t({ id: ['module', 'nwind', 'orders', 'field', 'city', 'title'], defaultMessage: p.title ?? 'city' })"),
    ).toEqual([])
    // Even with a literal default: a keyed message is never the scan's.
    expect(extractFrom("t({ id: ['x'], defaultMessage: 'literal' })")).toEqual([])
  })

  it('reads an appError template and its hint as two messages', () => {
    const found = collectMessages([
      fixture(
        'error.ts',
        "appError({ message: 'Failed to fetch {table} ({status})', hint: 'Try again', values: { table: 'x', status: 1 }, details: 'trace' })",
      ),
    ])
    expect([...found.keys()]).toEqual(['Failed to fetch {table} ({status})', 'Try again'])
  })

  it('reads a <Trans id>, so rich text is in the index like everything else', () => {
    expect(extractFrom('export const a = () => <Trans id="Delete <bold>{name}</bold>?" />')).toEqual([
      'Delete <bold>{name}</bold>?',
    ])
  })

  it('keeps a comment for the translator', () => {
    const found = collectMessages([fixture('c.tsx', "t({ message: 'Right', comment: 'the direction' })")])
    expect(found.get('Right')?.comment).toBe('the direction')
  })
})

describe('what the scan refuses', () => {
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
    // A form-2 id has to be static: it is part of the key.
    expect(refusalFor("declare const p: string; t({ id: [p], message: 'View' })")).toMatch(/array of string literals/)
  })

  it('refuses a code key that starts with the reserved root', () => {
    expect(refusalFor("t({ id: ['module', 'x'], message: 'View' })")).toMatch(/reserved segment "module"/)
  })

  it('names the file and the line, so the complaint is actionable', () => {
    expect(refusalFor("declare const c: boolean; t(c ? 'Yes' : 'No')", 'named.tsx')).toMatch(/named\.tsx:1:29/)
  })

  it('lets an identifier or a member expression through, recording nothing', () => {
    // `t(entry.title)` renders a msg() descriptor scanned at its own
    // declaration site, or an operator's plain string, which discovery records.
    expect(extractFrom('declare const entry: { title: string }; t(entry.title)')).toEqual([])
    expect(extractFrom('declare const rows: string[]; t(rows[0])')).toEqual([])
    expect(extractFrom('declare const title: string; t(title)')).toEqual([])
  })
})

describe('reconciling the index', () => {
  const found = new Map([
    ['Save', { source: 'Save' }],
    ['columnVisibility.View', { source: 'View' }],
  ])

  it('sets the code half from the scan and never touches module.*', () => {
    const out = reconcileIndex(
      {
        locale: 'en-US',
        name: 'English',
        messages: {
          'module.nwind.orders.field.city.title': 'City',
          'Old wording': 'Old wording',
          Save: 'Save',
        },
      },
      found,
    )
    expect(out.messages).toEqual({
      Save: 'Save',
      'columnVisibility.View': 'View',
      'module.nwind.orders.field.city.title': 'City',
    })
    expect(out.name).toBe('English')
  })
})

describe('reconciling a language', () => {
  const found = new Map([['Save', { source: 'Save' }]])

  it('never overwrites an existing translation, and adds a gap for a new key', () => {
    const out = reconcileLanguage({ locale: 'de-DE', name: 'Deutsch', messages: { Save: 'Speichern' } }, found)
    expect(out.messages).toEqual({ Save: 'Speichern' })

    const fresh = reconcileLanguage({ locale: 'de-DE', messages: {} }, found)
    expect(fresh.messages).toEqual({ Save: '' })
  })

  it('moves a removed code key to obsolete, drops it when it held nothing, and leaves module.* alone', () => {
    const out = reconcileLanguage(
      {
        locale: 'de-DE',
        messages: {
          Save: 'Speichern',
          'Old wording': 'Alt',
          Never: '',
          'module.nwind.orders.field.city.title': 'Stadt',
          'module.nwind.orders.field.zip.title': '',
        },
      },
      found,
    )

    expect(out.obsolete).toEqual({ 'Old wording': 'Alt' })
    expect(out.messages).toEqual({
      Save: 'Speichern',
      'module.nwind.orders.field.city.title': 'Stadt',
      'module.nwind.orders.field.zip.title': '',
    })
  })

  it('empties obsolete on --prune', () => {
    const out = reconcileLanguage(
      { locale: 'de-DE', messages: { Save: 'Speichern' }, obsolete: { Old: 'Alt' } },
      found,
      { prune: true },
    )
    expect(out.obsolete).toBeUndefined()
  })

  it('is idempotent and sorted, so a rerun is a no-op on any machine', () => {
    const messy = { locale: 'de-DE', name: 'Deutsch', messages: { Zebra: 'Zebra', Save: 'Speichern' } }
    const wide = new Map([
      ['Save', { source: 'Save' }],
      ['Zebra', { source: 'Zebra' }],
    ])

    const once = reconcileLanguage(messy, wide)
    const twice = reconcileLanguage(once, wide)

    expect(serialize(twice)).toBe(serialize(once))
    expect(Object.keys(once.messages ?? {})).toEqual(['Save', 'Zebra'])
    expect(serialize(once).endsWith('\n')).toBe(true)
    expect(serialize(once)).not.toContain('\r')
  })
})
