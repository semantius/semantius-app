import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { MANAGED_LANGUAGES } from '../../scripts/i18n/extract.mjs'
import { buildWorkFile, createLanguageFile, endonymFor, readHintLanguages } from '../../scripts/i18n/translate.mjs'
import { mergeIntoFile, validateWork } from '../../scripts/i18n/import.mjs'
import { fillEmptyMessages } from '../../scripts/i18n/export.mjs'
import type { LocaleFile } from '@/i18n'

/**
 * The agent-facing scripts, exercised without a target.
 *
 * They are how a language is actually translated — an agent runs
 * `i18n:translate`, fills the file in and runs `i18n:import` — so the parts
 * that DECIDE things are pure functions the scripts call, and this is where
 * those decisions are pinned. The network half (`tenant.mjs`) speaks the
 * endpoint contract, which `src/i18n/tenantTranslations.test.tsx` meets for
 * real.
 *
 * The refusals matter more than the acceptances. A work file that silently
 * imported a translation with the wrong placeholder would put a message on
 * screen with a hole in it, and nothing downstream would notice.
 */

/** Temp folders the file-writing tests make, removed once they have all run. */
const tempDirs: string[] = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

const index: LocaleFile = {
  locale: 'en-US',
  messages: {
    Save: 'Save',
    'Delete {label}?': 'Delete {label}?',
    'columnVisibility.View': 'View',
    'module.nwind.customers.entity.plural_label': 'Customers',
    'module.nwind.customers.enum.status.active': 'active',
  },
}

describe('buildWorkFile', () => {
  it('asks for every index key the language has no answer for, model text included', () => {
    const work = buildWorkFile('de-DE', {
      index,
      file: { locale: 'de-DE', messages: { Save: 'Speichern', 'Delete {label}?': '' } },
    })

    // 'Save' is translated, so it is not asked for again; an EMPTY entry is a
    // gap and is; a key the file does not mention at all is too.
    expect(work.entries.map((entry) => entry.key)).toEqual([
      'Delete {label}?',
      'columnVisibility.View',
      'module.nwind.customers.entity.plural_label',
      'module.nwind.customers.enum.status.active',
    ])
  })

  it('never discards a translation already filled into the work file', () => {
    // Rebuilding is a mid-job thing to do — the index grew, a hint language
    // moved on — and it used to write every `translation` back as ''. Half a
    // day of work, gone, with no warning and nothing to restore from.
    const previous = buildWorkFile('de-DE', { index, file: { locale: 'de-DE' } })
    previous.entries[0].translation = 'Speichern'
    previous.entries[1].comment = 'the label is the entity name'

    const rebuilt = buildWorkFile('de-DE', { index, file: { locale: 'de-DE' }, previous })

    expect(rebuilt.entries[0].translation).toBe('Speichern')
    expect(rebuilt.carriedOver).toBe(1)
    // A comment rides along with the translation it belongs to, and only there:
    // entry 1 was never filled in, so there is nothing of its author's to keep.
    expect(rebuilt.entries[1].comment).toBeUndefined()
  })

  it('says which filled entries are no longer asked for, and why', () => {
    const previous = buildWorkFile('de-DE', { index, file: { locale: 'de-DE' } })
    previous.entries[0].translation = 'Speichern'
    previous.entries.push({ key: 'A string that left the code', source: 'A string that left the code', translation: 'Weg' })

    // 'Save' is in the language file now, so it is not asked for again — its
    // translation LANDED. The other key is in no index, so its text has
    // nowhere to go: that is the one case a rebuild costs you something, and
    // it is reported by key rather than counted.
    const rebuilt = buildWorkFile('de-DE', { index, file: { locale: 'de-DE', messages: { Save: 'Speichern' } }, previous })

    expect(rebuilt.dropped.landed).toEqual(['Save'])
    expect(rebuilt.dropped.orphaned).toEqual(['A string that left the code'])
    expect(rebuilt.entries.some((entry) => entry.key === 'Save')).toBe(false)
  })

  it('carries what every OTHER managed language says, as context', () => {
    // English underspecifies. `View` alone does not say whether it is the verb
    // or the noun; a reviewed German has already had to decide. Two sources
    // bracket the meaning, one leaves the next translator re-deriving it.
    const hints = [{ code: 'de-DE', messages: { 'columnVisibility.View': 'Ansicht', Save: 'Speichern' } }]
    const work = buildWorkFile('fr-FR', { index, file: { locale: 'fr-FR' }, hints })

    expect(work.entries.find((entry) => entry.key === 'columnVisibility.View')?.hints).toEqual({ 'de-DE': 'Ansicht' })
    // Absent, not empty: German has no answer for this one either, and a gap
    // offered as context is worse than no context.
    expect(work.entries.find((entry) => entry.key === 'Delete {label}?')).not.toHaveProperty('hints')
  })

  it('carries the source, and nothing derived from it', () => {
    // No `placeholders` field: `validateWork` reads them off the source text on
    // both sides. A copy stored here would be an expectation living in the file
    // the translator edits, and emptying it turns the check off (see below).
    const work = buildWorkFile('de-DE', { index, file: { locale: 'de-DE' } })
    expect(work.entries.find((entry) => entry.key === 'Delete {label}?')).toEqual({
      key: 'Delete {label}?',
      source: 'Delete {label}?',
      translation: '',
    })
    expect(work.entries.find((entry) => entry.key === 'columnVisibility.View')?.source).toBe('View')
  })

  it('skips what the target already answers', () => {
    const work = buildWorkFile('de-DE', {
      index,
      file: { locale: 'de-DE' },
      record: { Save: 'Speichern', 'module.nwind.customers.entity.plural_label': 'Kunden' },
    })
    expect(work.entries.map((entry) => entry.key)).not.toContain('Save')
    expect(work.entries.map((entry) => entry.key)).not.toContain('module.nwind.customers.entity.plural_label')
  })
})

describe('the managed languages', () => {
  it('are read off disk, minus the one being translated', () => {
    // The real folder: de-DE is the reviewed language today, so it is context
    // for every other language and for none of its own work.
    expect(MANAGED_LANGUAGES).toContain('de-DE')
    expect(readHintLanguages('de-DE').map((hint) => hint.code)).toEqual([])

    const forFrench = readHintLanguages('fr-FR')
    expect(forFrench.map((hint) => hint.code)).toEqual(MANAGED_LANGUAGES)
    expect(Object.keys(forFrench[0].messages).length).toBeGreaterThan(0)
  })

  it('do not grow just because a language file appeared', () => {
    // A language becomes a hint source by a deliberate edit to
    // MANAGED_LANGUAGES after review — never by existing. A machine-filled
    // language quoted as context to the next one propagates its mistakes and
    // makes them look corroborated.
    const dir = mkdtempSync(join(tmpdir(), 'i18n-managed-'))
    tempDirs.push(dir)
    writeFileSync(join(dir, 'it-IT.json'), JSON.stringify({ locale: 'it-IT', name: 'Italiano', messages: { Save: 'Salva' } }))
    expect(readHintLanguages('fr-FR', dir).map((hint) => hint.code)).not.toContain('it-IT')
  })
})

describe('createLanguageFile', () => {
  it('writes the shape a shipped language has, named in its own language', () => {
    // The file IS the registration: `__SHIPPED_LOCALES__` is read off this
    // folder by vite.config.ts, so nothing else has to be told about it.
    const dir = mkdtempSync(join(tmpdir(), 'i18n-create-'))
    tempDirs.push(dir)

    const made = createLanguageFile('fr-FR', { dir })
    expect(made.created).toBe(true)
    expect(JSON.parse(readFileSync(made.path, 'utf8'))).toEqual({ locale: 'fr-FR', name: endonymFor('fr-FR'), messages: {} })
    expect(endonymFor('fr-FR')).toBe('français')

    // Re-running is not a way to lose a language's translations.
    writeFileSync(made.path, JSON.stringify({ locale: 'fr-FR', name: 'français', messages: { Save: 'Enregistrer' } }))
    expect(createLanguageFile('fr-FR', { dir }).created).toBe(false)
    expect(JSON.parse(readFileSync(made.path, 'utf8')).messages).toEqual({ Save: 'Enregistrer' })
  })

  it('refuses a name that is not a language tag', () => {
    // `languageFiles()` matches BCP-47 by regex, so a file named anything else
    // would sit in the folder unlisted and unexplained.
    expect(() => createLanguageFile('français', { dir: tmpdir() })).toThrow(/BCP-47/)
  })
})

describe('validateWork', () => {
  const entry = (over: Record<string, unknown>) => ({
    key: 'Delete {label}?',
    source: 'Delete {label}?',
    translation: '',
    ...over,
  })

  it('accepts a correctly filled file', () => {
    expect(validateWork({ locale: 'de-DE', entries: [entry({ translation: '{label} löschen?' })] })).toEqual([])
  })

  it('rejects a translation that drops or invents a placeholder', () => {
    // A dropped placeholder loses the value on screen; an invented one renders
    // as literal braces. Neither is visible in a diff of a thousand entries.
    expect(validateWork({ locale: 'de-DE', entries: [entry({ translation: 'Löschen?' })] })).toHaveLength(1)
    expect(validateWork({ locale: 'de-DE', entries: [entry({ translation: '{name} löschen?' })] })).toHaveLength(1)
  })

  it('takes the expectation from the source, so no field in the file can switch it off', () => {
    // The check once read `entry.placeholders`, which the translator edits.
    // Emptying it made a dropped placeholder pass — the one case the check is
    // for. Two locks now: the schema refuses the field outright, and even
    // carrying it the drop is still reported, because the expectation comes
    // from `source`.
    const dropped = 'Löschen?'
    for (const stale of [[], ['nonsense']]) {
      const problems = validateWork({ locale: 'de-DE', entries: [entry({ translation: dropped, placeholders: stale })] })
      expect(problems.some((p) => p.includes('additional properties')), `${stale}: schema`).toBe(true)
      expect(problems.some((p) => p.includes('placeholders are [] but the source has [label]')), `${stale}: check`).toBe(true)
    }
  })

  it('reports a source that is not ICU rather than passing everything under it', () => {
    // A model description holding a JSON literal parses as an ICU argument of
    // an unknown type. Reading placeholders off it throws, and a throw here
    // used to be swallowed into an empty expectation at write time.
    const problems = validateWork({
      locale: 'de-DE',
      entries: [{ key: 'k', source: 'array of {a, b, c}', translation: 'Feld' }],
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('source')
  })

  it('rejects a translation that does not compile as ICU', () => {
    const broken = { locale: 'de-DE', entries: [entry({ translation: '{label löschen?' })] }
    expect(validateWork(broken)[0]).toContain('does not compile')
  })

  it('exempts a plain server sentence, which is looked up verbatim', () => {
    // A PostgreSQL message may legitimately contain braces, and running it
    // through the ICU compiler would either throw or silently eat them.
    const work = {
      locale: 'de-DE',
      entries: [{ key: '22P02', source: 'bad {1,2', translation: 'schlecht {1,2' }],
    }
    expect(validateWork(work)).toEqual([])
  })

  it('rejects a shape the schema does not know, so a typo is not silently ignored', () => {
    expect(validateWork({ locale: 'de-DE', entries: [entry({ translation: 'x', origin: ['a'] })] })).not.toEqual([])
    expect(validateWork({ locale: 'de-DE', entries: { message: [] } })).not.toEqual([])
  })

  it('reports EVERY problem, not the first', () => {
    const work = {
      locale: 'de-DE',
      entries: [entry({ translation: 'Löschen?' }), entry({ key: 'Save', translation: '{x' })],
    }
    expect(validateWork(work).length).toBeGreaterThan(1)
  })

  it('ignores an entry nobody has filled in yet', () => {
    expect(validateWork({ locale: 'de-DE', entries: [entry({})] })).toEqual([])
  })
})

describe('mergeIntoFile', () => {
  it('fills an empty or absent entry and never overwrites a reviewed one', () => {
    const file: LocaleFile = { locale: 'de-DE', messages: { Save: '', Delete: 'Löschen' } }
    const written = mergeIntoFile(file, {
      locale: 'de-DE',
      entries: [
        { key: 'Save', source: 'Save', translation: 'Speichern' },
        { key: 'Delete', source: 'Delete', translation: 'ETWAS ANDERES' },
        { key: 'module.nwind.customers.entity.plural_label', source: 'Customers', translation: 'Kunden' },
        { key: 'Untouched', source: 'Untouched', translation: '' },
      ],
    })

    expect(written).toBe(2)
    expect(file.messages).toEqual({
      Save: 'Speichern',
      Delete: 'Löschen',
      'module.nwind.customers.entity.plural_label': 'Kunden',
    })
  })
})

describe('fillEmptyMessages (export)', () => {
  it('copies a record translation into a gap, and only into a gap', () => {
    const file: LocaleFile = { locale: 'de-DE', messages: { Save: '', Delete: 'Löschen' } }
    const filled = fillEmptyMessages(file, { Save: 'Speichern', Delete: 'ETWAS ANDERES', Unknown: 'Unbekannt' })

    expect(filled).toBe(1)
    // `Unknown` is not in the file at all: the index is what says what exists,
    // and a record is not allowed to invent a key.
    expect(file.messages).toEqual({ Save: 'Speichern', Delete: 'Löschen' })
  })
})
