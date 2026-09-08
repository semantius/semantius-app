import { describe, expect, it } from 'vitest'
import { buildWorkFile } from '../../scripts/i18n/translate.mjs'
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

  it('carries the source and the placeholders', () => {
    const work = buildWorkFile('de-DE', { index, file: { locale: 'de-DE' } })
    expect(work.entries.find((entry) => entry.key === 'Delete {label}?')).toEqual({
      key: 'Delete {label}?',
      source: 'Delete {label}?',
      translation: '',
      placeholders: ['label'],
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

describe('validateWork', () => {
  const entry = (over: Record<string, unknown>) => ({
    key: 'Delete {label}?',
    source: 'Delete {label}?',
    placeholders: ['label'],
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
