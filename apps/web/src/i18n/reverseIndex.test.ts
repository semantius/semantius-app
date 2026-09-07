import { afterEach, describe, expect, it } from 'vitest'
import type { EntityMetadata } from '@/types/metadata'
import {
  SOURCE_LANGUAGE,
  activateLocale,
  embeddedSegments,
  isRecordingRenders,
  labelOf,
  localizeMetadata,
  moduleOverride,
  msg,
  normalizeRenderedText,
  recordRender,
  renderedSourceOf,
  resolveRenderedText,
  reverseIndexSize,
  setRecordingRenders,
  translate,
  translateDynamic,
} from '.'

/**
 * The render-time reverse index translate mode resolves the page through.
 *
 * Pure module state, so it runs in `node`: what is asserted is that every
 * producer of text — `translate()`, the label helpers, `translateDynamic()` —
 * records exactly what it rendered against the id that rendered it, and only
 * while recording is on.
 */

const GERMAN = { language: 'de-DE', locale: 'de-DE' }

afterEach(() => {
  setRecordingRenders(false)
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

  it('records a message with a context under its context-bearing id', () => {
    setRecordingRenders(true)
    const rendered = translate(msg('View', { context: 'column visibility' }))

    expect([...resolveRenderedText(rendered)!]).toEqual(['Viewcolumn visibility'])
  })

  it('keeps every id when two messages render the same text', () => {
    setRecordingRenders(true)
    recordRender('View', 'View', 'View')
    recordRender('View', 'Viewcolumn visibility', 'View')

    // Two meanings, one word on screen: the editor has to offer both.
    expect(resolveRenderedText('View')?.size).toBe(2)
  })

  it('normalizes whitespace the way a text node carries it', () => {
    setRecordingRenders(true)
    recordRender('Log out', 'Log out', 'Log out')

    expect(normalizeRenderedText('  Log\n  out ')).toBe('Log out')
    expect(resolveRenderedText('\n  Log   out\n')).toBeDefined()
  })

  it('records a label with the model text as its source, translated or not', () => {
    setRecordingRenders(true)

    expect(labelOf({}, 'table', 'customers.plural_label', 'Customers')).toBe('Customers')
    expect([...resolveRenderedText('Customers')!]).toEqual(['table:customers.plural_label'])

    expect(labelOf({ 'table:customers.plural_label': 'Kunden' }, 'table', 'customers.plural_label', 'Customers')).toBe('Kunden')
    expect([...resolveRenderedText('Kunden')!]).toEqual(['table:customers.plural_label'])
    // The source stays the model's English: that is what the editor shows.
    expect(renderedSourceOf('table:customers.plural_label')).toBe('Customers')
  })

  it('records enum values through localizeMetadata even when nothing overrides them', () => {
    setRecordingRenders(true)
    const meta = {
      table: { table_name: 'orders', singular_label: 'Order', plural_label: 'Orders' },
      properties: { status: { type: 'string', title: 'Status', enum: ['open', 'closed'] } },
    } as unknown as EntityMetadata

    // Identity is kept when nothing changes — the memo contract — and the walk
    // still happened, which is what the recording proves.
    expect(localizeMetadata(meta, {})).toBe(meta)
    expect([...resolveRenderedText('open')!]).toEqual(['enum:orders.status.open'])
    expect([...resolveRenderedText('Status')!]).toEqual(['column:orders.status.title'])
    expect([...resolveRenderedText('Orders')!]).toEqual(['table:orders.plural_label'])
  })

  it('records a module name and description, because either may be what renders', () => {
    setRecordingRenders(true)
    moduleOverride({}, 'crm', { module_name: '_core', description: 'Administration' })

    expect([...resolveRenderedText('_core')!]).toEqual(['module:crm.name'])
    expect([...resolveRenderedText('Administration')!]).toEqual(['module:crm.description'])
  })

  it('records runtime text under its scope', () => {
    setRecordingRenders(true)
    translateDynamic('Order must have at least one line', { scope: 'server' })

    expect([...resolveRenderedText('Order must have at least one line')!]).toEqual([
      'server:Order must have at least one line',
    ])
  })

  it('keeps the values interpolated into a message, so an embedded label stays reachable', async () => {
    setRecordingRenders(true)
    await activateLocale(GERMAN)
    // The order a component renders in: the label first, the sentence around
    // it second. Resolution is lazy, so the reverse order works too.
    labelOf({}, 'table', 'suppliers.singular_label', 'Supplier')
    const rendered = translate('Add {label}', { label: 'Supplier' })

    expect(rendered).toBe('Supplier hinzufügen')
    // The whole sentence resolves to the message, which IS translated…
    expect([...resolveRenderedText(rendered)!]).toEqual(['Add {label}'])
    // …and the label inside it is still findable on its own.
    const segments = embeddedSegments(rendered)
    expect(segments).toHaveLength(1)
    expect(segments[0].value).toBe('Supplier')
    expect([...segments[0].ids]).toEqual(['table:suppliers.singular_label'])
  })

  it('records a value the message did not actually interpolate as nothing', async () => {
    setRecordingRenders(true)
    await activateLocale(GERMAN)
    labelOf({}, 'table', 'suppliers.singular_label', 'Supplier')
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
