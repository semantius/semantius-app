import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EntityMetadata } from '@/types/metadata'
import {
  SOURCE_LANGUAGE,
  activateLocale,
  embeddedSegments,
  isRecordingRenders,
  localeLayers,
  localizeMetadata,
  metadataText,
  msg,
  normalizeRenderedText,
  recordRender,
  renderedSourceOf,
  resolveRenderedText,
  reverseIndexSize,
  setRecordingRenders,
  translate,
  translateVerbatim,
  type LocaleFile,
  type LocaleLayer,
} from '.'

/**
 * The render-time reverse index translate mode resolves the page through.
 *
 * Pure module state, so it runs in `node`: what is asserted is that every
 * producer of text — `translate()`, the metadata helpers, `translateVerbatim()`
 * — records exactly what it rendered against the key that rendered it, and
 * only while recording is on. The test language is supplied as a layer of the
 * real store, so the German below arrives through the real activation.
 */

const TEST_LANGUAGE = 'xx-TEST'
const file: LocaleFile = {
  locale: TEST_LANGUAGE,
  messages: {
    'Customer {id}': 'Kunde {id}',
    'Add {label}': '{label} hinzufügen',
    'module.crm.customers.entity.plural_label': 'Kunden',
  },
}
const layer: LocaleLayer = {
  name: 'test',
  load: (language) => Promise.resolve(language === TEST_LANGUAGE ? file : null),
}
const GERMAN = { language: TEST_LANGUAGE, locale: TEST_LANGUAGE }

beforeEach(() => {
  localeLayers.push(layer)
})

afterEach(async () => {
  setRecordingRenders(false)
  localeLayers.splice(localeLayers.indexOf(layer), 1)
  await activateLocale({ language: SOURCE_LANGUAGE, locale: SOURCE_LANGUAGE })
})

describe('recording', () => {
  it('is off by default and records nothing then', () => {
    expect(isRecordingRenders()).toBe(false)
    translate('Log out')
    expect(resolveRenderedText('Log out')).toBeUndefined()
    expect(reverseIndexSize()).toBe(0)
  })

  it('resolves interpolated text to the message that produced it', async () => {
    setRecordingRenders(true)
    await activateLocale(GERMAN)

    expect(translate('Customer {id}', { id: '1002' })).toBe('Kunde 1002')

    // The rendered string, values included, is the key; the id is the source.
    expect([...resolveRenderedText('Kunde 1002')!]).toEqual(['Customer {id}'])
    expect(renderedSourceOf('Customer {id}')).toBe('Customer {id}')
  })

  it('records a disambiguated message under its prefixed key', () => {
    setRecordingRenders(true)
    const rendered = translate(msg('View', { id: ['columnVisibility'] }))

    expect([...resolveRenderedText(rendered)!]).toEqual(['columnVisibility.View'])
  })

  it('keeps every key when two messages render the same text', () => {
    setRecordingRenders(true)
    recordRender('View', 'View', 'View')
    recordRender('View', 'columnVisibility.View', 'View')

    // Two meanings, one word on screen: the editor has to offer both.
    expect(resolveRenderedText('View')?.size).toBe(2)
  })

  it('normalizes whitespace the way a text node carries it', () => {
    setRecordingRenders(true)
    recordRender('Log out', 'Log out', 'Log out')

    expect(normalizeRenderedText('  Log\n  out ')).toBe('Log out')
    expect(resolveRenderedText('\n  Log   out\n')).toBeDefined()
  })

  it('records a model label with the model text as its source, translated or not', async () => {
    setRecordingRenders(true)

    expect(metadataText(['module', 'crm', 'customers', 'entity', 'plural_label'], 'Customers')).toBe('Customers')
    expect([...resolveRenderedText('Customers')!]).toEqual(['module.crm.customers.entity.plural_label'])

    await activateLocale(GERMAN)
    expect(metadataText(['module', 'crm', 'customers', 'entity', 'plural_label'], 'Customers')).toBe('Kunden')
    expect([...resolveRenderedText('Kunden')!]).toEqual(['module.crm.customers.entity.plural_label'])
    // The source stays the model's English: that is what the editor shows.
    expect(renderedSourceOf('module.crm.customers.entity.plural_label')).toBe('Customers')
  })

  it('records enum values through localizeMetadata even when nothing translates them', () => {
    setRecordingRenders(true)
    const meta = {
      table: { table_name: 'orders', module_slug: 'crm', singular_label: 'Order', plural_label: 'Orders' },
      properties: { status: { type: 'string', title: 'Status', enum: ['open', 'closed'] } },
    } as unknown as EntityMetadata

    // Identity is kept when nothing changes — the memo contract — and the walk
    // still happened, which is what the recording proves.
    expect(localizeMetadata(meta)).toBe(meta)
    expect([...resolveRenderedText('open')!]).toEqual(['module.crm.orders.enum.status.open'])
    expect([...resolveRenderedText('Status')!]).toEqual(['module.crm.orders.field.status.title'])
    expect([...resolveRenderedText('Orders')!]).toEqual(['module.crm.orders.entity.plural_label'])
  })

  it('records a verbatim server sentence under its key', () => {
    setRecordingRenders(true)
    translateVerbatim('23505.modules_module_slug_key', 'duplicate key value violates unique constraint "modules_module_slug_key"')

    expect([...resolveRenderedText('duplicate key value violates unique constraint "modules_module_slug_key"')!]).toEqual([
      '23505.modules_module_slug_key',
    ])
  })

  it('keeps the values interpolated into a message, so an embedded label stays reachable', async () => {
    setRecordingRenders(true)
    await activateLocale(GERMAN)
    // The order a component renders in: the label first, the sentence around
    // it second. Resolution is lazy, so the reverse order works too.
    metadataText(['module', 'crm', 'suppliers', 'entity', 'singular_label'], 'Supplier')
    const rendered = translate('Add {label}', { label: 'Supplier' })

    expect(rendered).toBe('Supplier hinzufügen')
    // The whole sentence resolves to the message, which IS translated…
    expect([...resolveRenderedText(rendered)!]).toEqual(['Add {label}'])
    // …and the label inside it is still findable on its own.
    const segments = embeddedSegments(rendered)
    expect(segments).toHaveLength(1)
    expect(segments[0].value).toBe('Supplier')
    expect([...segments[0].ids]).toEqual(['module.crm.suppliers.entity.singular_label'])
  })

  it('records a value the message did not actually interpolate as nothing', async () => {
    setRecordingRenders(true)
    await activateLocale(GERMAN)
    metadataText(['module', 'crm', 'suppliers', 'entity', 'singular_label'], 'Supplier')
    // A count is not text a translator can act on, and a value the pattern
    // never rendered is not in the string to mark.
    const rendered = translate('Add {label}', { label: 'Supplier', unused: 'Supplier' })

    expect(embeddedSegments(rendered).map((segment) => segment.value)).toEqual(['Supplier'])
    expect(embeddedSegments('A sentence never rendered')).toEqual([])
  })

  it('is emptied by every activation, whose text belongs to another language', async () => {
    setRecordingRenders(true)
    recordRender('Abmelden', 'Log out', 'Log out')
    expect(reverseIndexSize()).toBe(1)

    await activateLocale({ language: SOURCE_LANGUAGE, locale: SOURCE_LANGUAGE })

    expect(reverseIndexSize()).toBe(0)
  })

  it('is emptied when recording stops', () => {
    setRecordingRenders(true)
    recordRender('Abmelden', 'Log out', 'Log out')

    setRecordingRenders(false)

    expect(reverseIndexSize()).toBe(0)
  })
})
