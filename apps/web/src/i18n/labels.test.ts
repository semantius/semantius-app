import { describe, expect, it } from 'vitest'
import type { EntityMetadata } from '@/types/metadata'
import { flattenLabels, type LocaleFile } from './catalog'
import { enumLabel, localizeMetadata, moduleOverride, tableLabel, TABLE_ATTR } from './labels'

/**
 * Model-label overrides, as data.
 *
 * These labels never appear in a catalog and no extractor can see them, so the
 * only thing that can go wrong is the KEY: a mismatch between what the file
 * spells and what the app looks up shows as "the translation silently did
 * nothing". Every test here therefore goes through `flattenLabels` — the same
 * function `activateLocale` uses — rather than hand-building the flat map.
 */

const file: LocaleFile = {
  locale: 'de-DE',
  labels: {
    tables: {
      customers: {
        singular_label: 'Kunde',
        plural_label: 'Kunden',
        description: 'Alle Kunden',
        columns: {
          status: {
            title: 'Status',
            enum: { active: 'Aktiv', inactive: 'Inaktiv' },
          },
          company_name: { title: 'Firma', description: 'Der eingetragene Name' },
        },
      },
      orders: { plural_label: 'Aufträge' },
    },
    modules: {
      crm: { name: 'Kundenpflege', description: 'Vertrieb und Kontakte' },
      sales: { description: 'Nur eine Beschreibung' },
    },
  },
}

const labels = flattenLabels(file)

function metadata(): EntityMetadata {
  return {
    table: {
      table_name: 'customers',
      singular: 'customer',
      plural: 'customers',
      singular_label: 'Customer',
      plural_label: 'Customers',
      description: 'All customers',
      id_column: 'id',
      label_column: 'company_name',
    },
    properties: {
      company_name: { type: 'string', title: 'Company Name', description: 'The registered name' },
      status: { type: 'string', title: 'Status', enum: ['active', 'inactive', 'archived'] },
      untouched: { type: 'string', title: 'Untouched' },
    },
    children: [
      {
        id: 'orders',
        title: 'Orders',
        singular_label: 'Order',
        plural_label: 'Orders',
        id_column: 'id',
        label_column: 'order_id',
      },
    ],
  }
}

describe('flattenLabels', () => {
  it('builds the scoped ids the app looks up', () => {
    expect(labels['table:customers.plural_label']).toBe('Kunden')
    expect(labels['column:customers.status.title']).toBe('Status')
    expect(labels['enum:customers.status.active']).toBe('Aktiv')
    expect(labels['module:crm.name']).toBe('Kundenpflege')
  })

  it('drops an empty value, so the model label shows through', () => {
    const flat = flattenLabels({ locale: 'de-DE', labels: { tables: { customers: { plural_label: '' } } } })

    expect(flat).toEqual({})
  })
})

describe('localizeMetadata', () => {
  it('replaces the table, column and enum labels it has', () => {
    const localized = localizeMetadata(metadata(), labels)

    expect(localized.table?.singular_label).toBe('Kunde')
    expect(localized.table?.plural_label).toBe('Kunden')
    expect(localized.table?.description).toBe('Alle Kunden')
    expect(localized.properties?.company_name.title).toBe('Firma')
    expect(localized.properties?.company_name.description).toBe('Der eingetragene Name')
    expect(localized.properties?.status.enum_labels).toEqual({ active: 'Aktiv', inactive: 'Inaktiv' })
  })

  it('leaves the stored enum VALUES alone — they are what the database holds', () => {
    const localized = localizeMetadata(metadata(), labels)

    expect(localized.properties?.status.enum).toEqual(['active', 'inactive', 'archived'])
  })

  it('leaves a label with no override exactly as the model spelled it', () => {
    const localized = localizeMetadata(metadata(), labels)

    expect(localized.properties?.untouched.title).toBe('Untouched')
    // 'archived' has no entry, so nothing claims to translate it.
    expect(localized.properties?.status.enum_labels?.archived).toBeUndefined()
  })

  it('does not mutate the loader data it was handed', () => {
    const original = metadata()
    localizeMetadata(original, labels)

    expect(original.table?.plural_label).toBe('Customers')
    expect(original.properties?.status.enum_labels).toBeUndefined()
  })

  it('answers the SAME object when nothing applies, so a memo below can trust identity', () => {
    const original = metadata()

    expect(localizeMetadata(original, {})).toBe(original)
    expect(localizeMetadata(original, flattenLabels({ locale: 'de-DE', labels: { tables: { other: {} } } }))).toBe(
      original,
    )
  })

  it('localizes a child relation through the child table\'s own labels', () => {
    const localized = localizeMetadata(metadata(), labels)

    expect(localized.children?.[0].plural_label).toBe('Aufträge')
    // No override for the singular, so the model's word stands.
    expect(localized.children?.[0].singular_label).toBe('Order')
  })

  it('is a no-op for metadata with no table name to key on', () => {
    const bare: EntityMetadata = { properties: { a: { type: 'string' } } }

    expect(localizeMetadata(bare, labels)).toBe(bare)
  })
})

describe('enumLabel', () => {
  it('falls back to the stored value, which is what the grid showed before', () => {
    const localized = localizeMetadata(metadata(), labels)
    const status = localized.properties?.status

    expect(enumLabel(status, 'active')).toBe('Aktiv')
    expect(enumLabel(status, 'archived')).toBe('archived')
    expect(enumLabel(undefined, 'active')).toBe('active')
  })
})

describe('tableLabel', () => {
  it('answers the override, else the fallback the model supplied', () => {
    expect(tableLabel(labels, 'customers', TABLE_ATTR.plural, 'Customers')).toBe('Kunden')
    expect(tableLabel(labels, 'suppliers', TABLE_ATTR.plural, 'Suppliers')).toBe('Suppliers')
  })
})

describe('moduleOverride', () => {
  it('answers undefined when nothing overrides the module', () => {
    expect(moduleOverride(labels, 'inventory')).toBeUndefined()
  })

  it('carries whichever of the two attributes is present', () => {
    expect(moduleOverride(labels, 'crm')).toEqual({ name: 'Kundenpflege', description: 'Vertrieb und Kontakte' })
    expect(moduleOverride(labels, 'sales')).toEqual({ name: undefined, description: 'Nur eine Beschreibung' })
  })
})
