import { afterEach, describe, expect, it } from 'vitest'
import {
  addMessageEntry,
  assertMetadataId,
  flattenMessages,
  isKnownKey,
  isMetadataKey,
  joinSegments,
  messageId,
  msg,
  setCatalogState,
  sourceOf,
  splitSegments,
  translatedKeys,
  type MessageDescriptor,
} from './catalog'

/**
 * The key scheme, which everything else rests on: the three call forms, the
 * reserved root, and the segment escaping that lets an enum value carry a dot.
 * Pure, so it runs in `node` without the runtime.
 */

afterEach(() => {
  setCatalogState('en-US', {})
})

describe('the three call forms', () => {
  it('keys a plain message by its own text', () => {
    expect(messageId('Save')).toBe('Save')
    expect(messageId(msg('Save'))).toBe('Save')
    expect(sourceOf('Save')).toBe('Save')
  })

  it('prefixes a disambiguated message with its id, message appended as it is', () => {
    // The message is text a translator reads in the key, not a segment: a
    // sentence's own period is not escaped.
    expect(messageId({ id: ['columnVisibility'], message: 'View' })).toBe('columnVisibility.View')
    expect(messageId({ id: ['a', 'b'], message: 'Done.' })).toBe('a.b.Done.')
    expect(sourceOf({ id: ['columnVisibility'], message: 'View' })).toBe('View')
  })

  it('keys a keyed message by its id alone, the English being a fallback', () => {
    const descriptor: MessageDescriptor = {
      id: ['module', 'nwind', 'orders', 'field', 'city', 'title'],
      defaultMessage: 'City',
    }
    expect(messageId(descriptor)).toBe('module.nwind.orders.field.city.title')
    expect(sourceOf(descriptor)).toBe('City')
  })

  it('treats an empty id as no id', () => {
    expect(messageId({ id: [], message: 'View' })).toBe('View')
  })
})

describe('the reserved root', () => {
  it('refuses a code key that starts with module', () => {
    expect(() => messageId('module.anything')).toThrow(/reserved/)
    expect(() => messageId({ id: ['module'], message: 'View' })).toThrow(/reserved/)
    expect(() => messageId('module')).toThrow(/reserved/)
    // A word that merely begins with the letters is not the segment.
    expect(messageId('modules')).toBe('modules')
    expect(isMetadataKey('modules.x')).toBe(false)
    expect(isMetadataKey('module.x')).toBe(true)
  })

  it('checks a metadata id against the three shapes', () => {
    expect(() => assertMetadataId(['module', 'nwind', 'name'])).not.toThrow()
    expect(() => assertMetadataId(['module', 'nwind', 'orders', 'entity', 'plural_label'])).not.toThrow()
    expect(() => assertMetadataId(['module', 'nwind', 'orders', 'field', 'city', 'title'])).not.toThrow()
    expect(() => assertMetadataId(['module', 'nwind', 'orders', 'enum', 'status', 'open'])).not.toThrow()
    // A module attribute is not an entity attribute, and the markers are
    // required: without them `module.nwind.orders.status.title` would be
    // ambiguous between the `status` field's `title` and the `status` enum's
    // value `title`.
    expect(() => assertMetadataId(['module', 'nwind', 'plural_label'])).toThrow(/module attribute/)
    expect(() => assertMetadataId(['module', 'nwind', 'orders', 'title'])).toThrow(/3, 5 or 6/)
    expect(() => assertMetadataId(['module', 'nwind', 'orders', 'status', 'title'])).toThrow(/entity/)
    expect(() => assertMetadataId(['module', 'nwind', 'orders', 'status', 'x', 'title'])).toThrow(/field.*enum/)
    expect(() => assertMetadataId(['module', 'nwind', 'orders', 'field', 'city', 'nope'])).toThrow(/field attribute/)
    expect(() => assertMetadataId(['module', '', 'name'])).toThrow(/empty/)
    // And a keyed message that starts with the root goes through the same check.
    expect(() => messageId({ id: ['module', 'nwind', 'nope'], defaultMessage: 'x' })).toThrow(/module attribute/)
  })
})

describe('segments', () => {
  it('escapes a dot inside a segment and round-trips it', () => {
    // An enum value is data and may contain a dot; a table name may not.
    const id = ['module', 'files', 'documents', 'enum', 'kind', 'image.png']
    const key = joinSegments(id)
    expect(key).toBe('module.files.documents.enum.kind.image\\.png')
    expect(splitSegments(key)).toEqual(id)
  })

  it('escapes the escape character too', () => {
    const id = ['a', 'back\\slash', 'c']
    expect(splitSegments(joinSegments(id))).toEqual(id)
  })

  it('does not collide an entity named like a module attribute', () => {
    // 3 segments is a module attribute; 5 is an entity attribute. `name` as an
    // entity name sits in position 3 of a 5-segment key, never position 3 of a
    // 3-segment one.
    expect(messageId({ id: ['module', 'nwind', 'name'], defaultMessage: 'Northwind' })).toBe('module.nwind.name')
    expect(
      messageId({ id: ['module', 'nwind', 'name', 'entity', 'plural_label'], defaultMessage: 'Names' }),
    ).toBe('module.nwind.name.entity.plural_label')
  })
})

describe('the file', () => {
  it('drops an empty value, so the source shows through', () => {
    expect(flattenMessages({ locale: 'de-DE', messages: { Save: 'Speichern', Cancel: '' } })).toEqual({
      Save: 'Speichern',
    })
  })
})

describe('the active state', () => {
  it('tells a translated key from a known-but-empty one', () => {
    setCatalogState('de-DE', { Save: 'Speichern' }, ['Save', 'Cancel'])
    expect(translatedKeys('de-DE').has('Save')).toBe(true)
    expect(translatedKeys('de-DE').has('Cancel')).toBe(false)
    expect(isKnownKey('Cancel')).toBe(true)
    expect(isKnownKey('Delete')).toBe(false)
    // Another language has no truthful answer.
    expect(translatedKeys('fr-FR').size).toBe(0)
  })

  it('adds and clears one entry without touching the rest', () => {
    setCatalogState('de-DE', { Save: 'Speichern' })
    addMessageEntry('Cancel', 'Abbrechen')
    expect(translatedKeys('de-DE').has('Cancel')).toBe(true)
    addMessageEntry('Cancel', '')
    expect(translatedKeys('de-DE').has('Cancel')).toBe(false)
    // Cleared is still KNOWN: an empty entry is an entry.
    expect(isKnownKey('Cancel')).toBe(true)
    expect(translatedKeys('de-DE').has('Save')).toBe(true)
  })
})
