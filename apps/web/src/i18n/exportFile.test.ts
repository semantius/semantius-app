import { describe, expect, it } from 'vitest'
import { extract } from '../../scripts/i18n/extract.mjs'
import { buildExportFile, completeWorkList, serializeLocaleFile } from './exportFile'
import { mergeLocaleFiles } from './store'
import type { LocaleFile } from './catalog'

/**
 * "Download <code>.json": the merge of the layers, completed into a work list.
 *
 * Pure, so it runs in `node` — and against the real repo catalog for the last
 * test, which is the one that says the shipped German is complete.
 */

const index = {
  locale: 'en-US',
  index: {
    Save: { message: 'Save', origin: ['src/a.tsx'], placeholders: [] },
    'Delete {label}?': { message: 'Delete {label}?', origin: ['src/b.tsx'], placeholders: ['label'] },
    'Viewcolumn visibility': {
      message: 'View',
      context: 'column visibility',
      origin: ['src/c.tsx'],
      placeholders: [],
    },
  },
}

describe('mergeLocaleFiles', () => {
  it('lets a later layer win, but never with an empty value', () => {
    const repo: LocaleFile = { locale: 'de-DE', messages: { Save: 'Speichern', 'Delete {label}?': '{label} löschen?' } }
    const tenant: LocaleFile = {
      locale: 'de-DE',
      name: 'Deutsch (Mandant)',
      messages: { Save: 'Sichern', 'Delete {label}?': '' },
      labels: { tables: { customers: { plural_label: 'Kunden' } } },
    }

    const merged = mergeLocaleFiles('de-DE', [repo, tenant])

    expect(merged.messages).toEqual({ Save: 'Sichern', 'Delete {label}?': '{label} löschen?' })
    expect(merged.labels?.tables?.customers?.plural_label).toBe('Kunden')
    expect(merged.name).toBe('Deutsch (Mandant)')
  })

  it('answers an empty file for no layers at all', () => {
    expect(mergeLocaleFiles('fr-FR', [])).toEqual({ locale: 'fr-FR' })
  })
})

describe('completeWorkList', () => {
  const inventory = [
    { scope: 'table' as const, key: 'customers.plural_label', source: 'Customers' },
    { scope: 'enum' as const, key: 'customers.status.active', source: 'active' },
  ]

  it('adds an empty entry for every index message and inventory label that has no translation', () => {
    const file: LocaleFile = {
      locale: 'de-DE',
      messages: { Save: 'Speichern' },
      labels: { tables: { customers: { plural_label: 'Kunden' } } },
    }

    const out = completeWorkList(file, index, inventory)

    expect(out.messages).toEqual({ 'Delete {label}?': '', Save: 'Speichern' })
    expect(out.contexts).toEqual({ 'column visibility': { View: '' } })
    expect(out.labels?.tables?.customers).toEqual({
      plural_label: 'Kunden',
      columns: { status: { enum: { active: '' } } },
    })
  })

  it('does not touch the file it was given', () => {
    const file: LocaleFile = { locale: 'de-DE', messages: { Save: 'Speichern' } }
    completeWorkList(file, index, inventory)
    expect(file).toEqual({ locale: 'de-DE', messages: { Save: 'Speichern' } })
  })

  it('is sorted, so two exports of one state are byte-identical', () => {
    const a = completeWorkList({ locale: 'de-DE', messages: { Save: 'x', 'Delete {label}?': 'y' } }, index, inventory)
    const b = completeWorkList({ locale: 'de-DE', messages: { 'Delete {label}?': 'y', Save: 'x' } }, index, inventory)
    expect(serializeLocaleFile(a)).toBe(serializeLocaleFile(b))
    expect(Object.keys(a.messages!)).toEqual(['Delete {label}?', 'Save'])
  })
})

describe('buildExportFile', () => {
  it('exports the shipped German with nothing left empty', async () => {
    // The real repo layer through the real loader. An empty value here is a
    // string added to code whose German was not filled in the same change.
    const file = await buildExportFile('de-DE', extract().index, [])
    const empty = Object.entries(file.messages ?? {}).filter(([, value]) => !value).map(([key]) => key)
    expect(empty).toEqual([])
    expect(Object.keys(file.messages ?? {}).length).toBeGreaterThan(300)
  })
})
