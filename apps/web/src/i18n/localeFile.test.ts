import { describe, expect, it } from 'vitest'
import { flattenDynamic, flattenLabels, flattenMessages, type LocaleFile } from './catalog'
import { localeFileToRows, parseLabelKey, rowsToLocaleFiles, type TranslationRow } from './localeFile'

/**
 * A translation lives in two shapes — a nested file and a flat row — and this is
 * the only thing that converts between them. It is the seam an export and an
 * import meet at, so a disagreement here means a language exported from a tenant
 * cannot be imported back into it, silently and only for some keys.
 */

const file: LocaleFile = {
  locale: 'de-DE',
  messages: { Save: 'Speichern', 'Delete {label}?': '{label} löschen?' },
  contexts: { 'column visibility': { View: 'Ansicht' } },
  labels: {
    tables: {
      customers: {
        singular_label: 'Kunde',
        plural_label: 'Kunden',
        columns: {
          status: { title: 'Status', enum: { active: 'Aktiv' } },
          region_id: { relationship_label: 'Kunden dieser Region' },
        },
      },
    },
    modules: { crm: { name: 'Kundenpflege' } },
  },
  server: { 'Order must have at least one line': 'Ein Auftrag braucht mindestens eine Position' },
  rule: { 'Credit limit exceeded': 'Kreditlimit überschritten' },
}

describe('localeFileToRows', () => {
  const rows = localeFileToRows(file)
  const find = (scope: string, key: string, context = '') =>
    rows.find((row) => row.scope === scope && row.key === key && row.context === context)

  it('keys a message by its source text and carries the context separately', () => {
    expect(find('message', 'Save')).toMatchObject({ locale: 'de-DE', translation: 'Speichern', context: '' })
    expect(find('message', 'View', 'column visibility')?.translation).toBe('Ansicht')
  })

  it('flattens the label tree into the four label scopes', () => {
    expect(find('table', 'customers.plural_label')?.translation).toBe('Kunden')
    expect(find('column', 'customers.status.title')?.translation).toBe('Status')
    expect(find('column', 'customers.region_id.relationship_label')?.translation).toBe('Kunden dieser Region')
    expect(find('enum', 'customers.status.active')?.translation).toBe('Aktiv')
    expect(find('module', 'crm.name')?.translation).toBe('Kundenpflege')
  })

  it('keeps the runtime scopes as their own rows', () => {
    expect(find('server', 'Order must have at least one line')).toBeTruthy()
    expect(find('rule', 'Credit limit exceeded')).toBeTruthy()
  })
})

describe('rowsToLocaleFiles', () => {
  it('round-trips a whole file without loss', () => {
    const back = rowsToLocaleFiles(localeFileToRows(file)).get('de-DE')!

    // Compared through the flatteners rather than by deep equality: those are
    // what the running app renders from, so agreement there is the property that
    // actually matters — and it tolerates a key the file happened not to declare.
    expect(flattenMessages(back)).toEqual(flattenMessages(file))
    expect(flattenLabels(back)).toEqual(flattenLabels(file))
    expect(flattenDynamic(back)).toEqual(flattenDynamic(file))
  })

  it('groups by locale', () => {
    const rows: TranslationRow[] = [
      { locale: 'de-DE', scope: 'message', key: 'Save', context: '', translation: 'Speichern' },
      { locale: 'fr-FR', scope: 'message', key: 'Save', context: '', translation: 'Enregistrer' },
    ]
    const files = rowsToLocaleFiles(rows)

    expect([...files.keys()]).toEqual(['de-DE', 'fr-FR'])
    expect(files.get('fr-FR')?.messages).toEqual({ Save: 'Enregistrer' })
  })

  it('drops an empty translation — that is a QUEUE entry, not a translation', () => {
    const rows: TranslationRow[] = [
      { locale: 'de-DE', scope: 'message', key: 'Save', context: '', translation: '' },
    ]

    expect(rowsToLocaleFiles(rows).size).toBe(0)
    expect(rowsToLocaleFiles(rows, { includeEmpty: true }).get('de-DE')?.messages).toEqual({ Save: '' })
  })

  it('skips a malformed key instead of losing the whole language to it', () => {
    const rows: TranslationRow[] = [
      { locale: 'de-DE', scope: 'table', key: 'no_attribute_here', context: '', translation: 'x' },
      { locale: 'de-DE', scope: 'column', key: 'customers.status.not_an_attribute', context: '', translation: 'x' },
      { locale: 'de-DE', scope: 'message', key: 'Save', context: '', translation: 'Speichern' },
    ]

    expect(rowsToLocaleFiles(rows).get('de-DE')?.messages).toEqual({ Save: 'Speichern' })
    expect(rowsToLocaleFiles(rows).get('de-DE')?.labels).toBeUndefined()
  })
})

describe('parseLabelKey', () => {
  it('reads the three key shapes', () => {
    expect(parseLabelKey('table', 'customers.plural_label')).toEqual({
      table: 'customers',
      attribute: 'plural_label',
    })
    expect(parseLabelKey('column', 'customers.status.title')).toEqual({
      table: 'customers',
      field: 'status',
      attribute: 'title',
    })
    expect(parseLabelKey('module', 'crm.name')).toEqual({ module: 'crm', attribute: 'name' })
  })

  it('treats everything after the second dot as the enum VALUE', () => {
    // Table and field names are SQL identifiers and cannot contain a dot; an
    // enum value is DATA and may well.
    expect(parseLabelKey('enum', 'files.kind.image.png')).toEqual({
      table: 'files',
      field: 'kind',
      value: 'image.png',
    })
  })

  it('rejects an attribute outside the whitelist, so a typo is visible', () => {
    expect(parseLabelKey('table', 'customers.nope')).toBeNull()
    expect(parseLabelKey('column', 'customers.status.nope')).toBeNull()
    expect(parseLabelKey('module', 'crm.slug')).toBeNull()
    expect(parseLabelKey('enum', 'customers.status')).toBeNull()
  })
})
