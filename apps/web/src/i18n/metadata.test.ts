import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EntityMetadata } from '@/types/metadata'
import { activateLocale, localeLayers, type LocaleFile, type LocaleLayer } from '.'
import { enumLabel, localizeMetadata, metadataText } from './metadata'

/**
 * Model text, rendered as messages.
 *
 * These labels come from `get_schema`, so the only thing that can go wrong is
 * the KEY: a mismatch between what the file spells and what the app looks up
 * shows as "the translation silently did nothing". Every test here therefore
 * goes through a real activation — a test language supplied as a layer of the
 * real store — rather than a hand-built lookup.
 */

const TEST_LANGUAGE = 'xx-TEST'

const file: LocaleFile = {
  locale: TEST_LANGUAGE,
  messages: {
    'module.crm.customers.entity.singular_label': 'Kunde',
    'module.crm.customers.entity.plural_label': 'Kunden',
    'module.crm.customers.entity.description': 'Alle Kunden',
    'module.crm.customers.field.status.title': 'Status',
    'module.crm.customers.enum.status.active': 'Aktiv',
    'module.crm.customers.enum.status.inactive': 'Inaktiv',
    'module.crm.customers.field.company_name.title': 'Firma',
    'module.crm.customers.field.company_name.description': 'Der eingetragene Name',
    'module.crm.orders.entity.plural_label': 'Aufträge',
    'module.crm.orders.field.customer_id.title': 'Kunde',
    'module.crm.orders.field.customer_id.plural_label_parent': 'Aufträge des Kunden',
    'module.crm.name': 'Kundenpflege',
  },
}

const layer: LocaleLayer = {
  name: 'test',
  load: (language) => Promise.resolve(language === TEST_LANGUAGE ? file : null),
}

beforeEach(async () => {
  localeLayers.push(layer)
  await activateLocale({ language: TEST_LANGUAGE, locale: TEST_LANGUAGE })
})

afterEach(async () => {
  localeLayers.splice(localeLayers.indexOf(layer), 1)
  await activateLocale({ language: 'en-US', locale: 'en-US' })
})

function metadata(): EntityMetadata {
  return {
    table: {
      table_name: 'customers',
      module_slug: 'crm',
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
        id: 'orders.customer_id',
        title: 'Customer',
        singular_label: 'Order',
        plural_label: 'Orders',
        plural_label_parent: 'Orders of the customer',
        id_column: 'id',
        label_column: 'order_id',
      },
    ],
  }
}

describe('localizeMetadata', () => {
  it('replaces the entity, field and enum labels it has', () => {
    const localized = localizeMetadata(metadata())

    expect(localized.table?.singular_label).toBe('Kunde')
    expect(localized.table?.plural_label).toBe('Kunden')
    expect(localized.table?.description).toBe('Alle Kunden')
    expect(localized.properties?.company_name.title).toBe('Firma')
    expect(localized.properties?.company_name.description).toBe('Der eingetragene Name')
    expect(localized.properties?.status.enum_labels).toEqual({ active: 'Aktiv', inactive: 'Inaktiv' })
  })

  it('leaves the stored enum VALUES alone — they are what the database holds', () => {
    expect(localizeMetadata(metadata()).properties?.status.enum).toEqual(['active', 'inactive', 'archived'])
  })

  it('leaves a label with no translation exactly as the model spelled it', () => {
    const localized = localizeMetadata(metadata())

    expect(localized.properties?.untouched.title).toBe('Untouched')
    // 'archived' has no entry, so nothing claims to translate it.
    expect(localized.properties?.status.enum_labels?.archived).toBeUndefined()
  })

  it('does not mutate the loader data it was handed', () => {
    const original = metadata()
    localizeMetadata(original)

    expect(original.table?.plural_label).toBe('Customers')
    expect(original.properties?.status.enum_labels).toBeUndefined()
  })

  it('answers the SAME object when nothing applies, so a memo below can trust identity', () => {
    const other = { ...metadata(), table: { ...metadata().table!, module_slug: 'elsewhere' } }
    expect(localizeMetadata(other)).toBe(other)
  })

  it('keys a child relation by the child table and the foreign-key field, under the parent module', () => {
    const localized = localizeMetadata(metadata())

    expect(localized.children?.[0].plural_label).toBe('Aufträge')
    expect(localized.children?.[0].title).toBe('Kunde')
    expect(localized.children?.[0].plural_label_parent).toBe('Aufträge des Kunden')
    // No translation for the singular, so the model's word stands.
    expect(localized.children?.[0].singular_label).toBe('Order')
  })

  it('is a no-op for metadata with no module slug or table name to key on', () => {
    const bare: EntityMetadata = { properties: { a: { type: 'string' } } }
    expect(localizeMetadata(bare)).toBe(bare)
  })
})

describe('enumLabel', () => {
  it('falls back to the stored value, which is what the grid showed before', () => {
    const status = localizeMetadata(metadata()).properties?.status

    expect(enumLabel(status, 'active')).toBe('Aktiv')
    expect(enumLabel(status, 'archived')).toBe('archived')
    expect(enumLabel(undefined, 'active')).toBe('active')
  })
})

describe('metadataText', () => {
  it('answers the translation, else the fallback the model supplied, else nothing', () => {
    expect(metadataText(['module', 'crm', 'name'], 'CRM')).toBe('Kundenpflege')
    expect(metadataText(['module', 'crm', 'description'], 'Contacts')).toBe('Contacts')
    // An empty fallback is not a message: nothing is looked up and nothing minted.
    expect(metadataText(['module', 'crm', 'description'], undefined)).toBeUndefined()
    expect(metadataText(['module', 'crm', 'description'], '')).toBe('')
  })
})
