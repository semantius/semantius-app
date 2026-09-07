import { describe, expect, it } from 'vitest'
import { COLUMN_LABEL_ATTRIBUTES, flattenLabels, scopedId } from './catalog'
import {
  COLUMN_LABEL_ATTRIBUTES as FILE_COLUMN_ATTRIBUTES,
  MODULE_LABEL_ATTRIBUTES,
  TABLE_LABEL_ATTRIBUTES,
} from '../../scripts/i18n/localeFile.mjs'
import { buildLabelInventory, diffLabelInventory, parseEnumValues, type ModelRows } from './labelInventory'

/**
 * The inventory is the only discovery path model labels have.
 *
 * A code string is found by the extractor and listed in `en-US.json`; a table
 * label exists only as a row in the tenant's model, so "what still needs
 * translating" can only be computed by reading the model and diffing. If this is
 * wrong, a translator is told a language is complete when it is not.
 */

const rows: ModelRows = {
  tables: [
    {
      table_name: 'customers',
      singular_label: 'Customer',
      plural_label: 'Customers',
      description: 'People who buy things',
      updated_at: '2026-01-02T00:00:00Z',
    },
    // A table with no description: there is nothing to translate, so nothing is
    // listed — an empty source in front of a translator is worse than an absence.
    { table_name: 'orders', singular_label: 'Order', plural_label: 'Orders', description: '' },
  ],
  fields: [
    {
      table_name: 'customers',
      field_name: 'status',
      title: 'Status',
      enum_values: ['active', 'inactive'],
      updated_at: '2026-01-03T00:00:00Z',
    },
    {
      table_name: 'customers',
      field_name: 'region_id',
      title: 'Region',
      relationship_label: 'Customers in this region',
      singular_label_parent: 'Region',
      plural_label_parent: 'Regions',
    },
  ],
  modules: [
    { module_slug: 'crm', module_name: 'CRM', description: 'Contacts and deals' },
    { module_slug: 'empty', module_name: '', description: null },
  ],
}

const inventory = buildLabelInventory(rows)
const keysOf = (scope: string) => inventory.filter((e) => e.scope === scope).map((e) => e.key)

describe('buildLabelInventory', () => {
  it('lists every non-empty table label', () => {
    expect(keysOf('table')).toEqual([
      'customers.singular_label',
      'customers.plural_label',
      'customers.description',
      'orders.singular_label',
      'orders.plural_label',
    ])
  })

  it('lists the column attributes a locale file may override', () => {
    expect(keysOf('column')).toEqual([
      'customers.status.title',
      'customers.region_id.title',
      'customers.region_id.relationship_label',
      'customers.region_id.singular_label_parent',
      'customers.region_id.plural_label_parent',
    ])
  })

  it('lists one entry per enum value, keyed and sourced by the STORED value', () => {
    expect(keysOf('enum')).toEqual(['customers.status.active', 'customers.status.inactive'])
    // The model carries no English label for an enum value, so the value is its
    // own source — which is exactly what the grid shows until something overrides it.
    expect(inventory.find((e) => e.scope === 'enum')?.source).toBe('active')
  })

  it('skips a module with nothing to translate', () => {
    expect(keysOf('module')).toEqual(['crm.name', 'crm.description'])
  })

  it('carries the model row\'s updated_at, for "changed since translated"', () => {
    expect(inventory.find((e) => e.key === 'customers.plural_label')?.updatedAt).toBe('2026-01-02T00:00:00Z')
    expect(inventory.find((e) => e.key === 'orders.plural_label')?.updatedAt).toBeUndefined()
  })
})

describe('parseEnumValues', () => {
  it('reads the three shapes the column has actually been seen in', () => {
    expect(parseEnumValues(['a', 'b'])).toEqual(['a', 'b'])
    expect(parseEnumValues('["a","b"]')).toEqual(['a', 'b'])
    expect(parseEnumValues('a, b')).toEqual(['a', 'b'])
  })

  it('answers nothing for a column that is not an enum', () => {
    expect(parseEnumValues(null)).toEqual([])
    expect(parseEnumValues(undefined)).toEqual([])
    expect(parseEnumValues('')).toEqual([])
    expect(parseEnumValues(42)).toEqual([])
  })

  it('falls back to CSV when a bracketed value is not valid JSON', () => {
    expect(parseEnumValues('[broken')).toEqual(['[broken'])
  })
})

describe('diffLabelInventory', () => {
  const labels = flattenLabels({
    locale: 'de-DE',
    labels: {
      tables: {
        customers: {
          plural_label: 'Kunden',
          columns: { status: { enum: { active: 'Aktiv' } } },
        },
        // A table the model no longer has: a rename left this behind.
        legacy_accounts: { plural_label: 'Konten' },
      },
      modules: { crm: { name: 'Kundenpflege' } },
    },
  })

  const diff = diffLabelInventory(inventory, labels)

  it('splits the inventory into translated and missing', () => {
    expect(diff.translated.map((e) => e.key)).toEqual([
      'customers.plural_label',
      'customers.status.active',
      'crm.name',
    ])
    expect(diff.missing.map((e) => e.key)).toContain('customers.singular_label')
    expect(diff.missing.map((e) => e.key)).toContain('crm.description')
    expect(diff.missing).toHaveLength(inventory.length - diff.translated.length)
  })

  it('reports a translation whose key the model no longer has, rather than deleting it', () => {
    expect(diff.orphaned).toEqual([
      { scope: 'table', key: 'legacy_accounts.plural_label', translation: 'Konten' },
    ])
  })

  it('never calls a runtime message orphaned — no model inventory can account for one', () => {
    const withServerText = { ...labels, 'server:Order must have at least one line': 'Ein Auftrag braucht…' }

    expect(diffLabelInventory(inventory, withServerText).orphaned).toHaveLength(1)
  })
})

describe('the two halves of the key scheme agree', () => {
  /**
   * The inventory runs under bare `node` (so `scripts/i18n/labels.mjs` can use
   * it) and the app re-exports it, which leaves exactly two facts spelled on
   * both sides: the runtime id format and the attribute lists. Both are pinned
   * here rather than left to review — a silent disagreement would make the
   * script and the panel report different missing sets, and neither would look
   * wrong on its own.
   */
  it('builds the same id the app looks a label up by', () => {
    const inventory = buildLabelInventory({ tables: [{ table_name: 'customers', plural_label: 'Customers' }] })
    const labels = flattenLabels({
      locale: 'de-DE',
      labels: { tables: { customers: { plural_label: 'Kunden' } } },
    })

    // If `idOf` in the .mjs and `scopedId` here ever diverged, this diff would
    // report the entry as missing while the app rendered it translated.
    expect(Object.keys(labels)).toEqual([scopedId('table', 'customers.plural_label')])
    expect(diffLabelInventory(inventory, labels).translated).toHaveLength(1)
  })

  it('uses the same attribute lists the file mapping and the catalog do', () => {
    expect([...FILE_COLUMN_ATTRIBUTES]).toEqual([...COLUMN_LABEL_ATTRIBUTES])
    expect([...TABLE_LABEL_ATTRIBUTES]).toEqual(['singular_label', 'plural_label', 'description'])
    expect([...MODULE_LABEL_ATTRIBUTES]).toEqual(['name', 'description'])
  })
})
