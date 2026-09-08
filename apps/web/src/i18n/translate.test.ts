import { describe, expect, it } from 'vitest'
import { translate } from './translate'

/**
 * The two guards that keep catalog and model content from taking a screen
 * down. Both happened: an operator's file with a malformed pattern, and a
 * field description whose JSON example compiled as ICU and then threw at
 * render because `{alias_code, source_domain, …}` names no formatter.
 */
describe('translate', () => {
  it('renders a message that does not compile verbatim instead of throwing', () => {
    const broken = '{count, plural, one {# row}'
    expect(() => translate(broken)).not.toThrow()
    expect(translate(broken)).toBe(broken)
  })

  it('renders a message that compiles but cannot be formatted verbatim instead of throwing', () => {
    // The real description of `entities.catalog_entity_aliases` on the test
    // tenant: ICU reads `{alias_code, source_domain, …}` as an argument named
    // alias_code with the format type source_domain, and Lingui has no such
    // formatter — "formatter is not a function", at render, inside a route.
    const description =
      'Reuse/merge record: JSON array of {alias_code, source_domain, source_module, decided}. Append-only. Empty array = never a merge target.'
    expect(() =>
      translate({ id: ['module', 'admin', 'entities', 'field', 'catalog_entity_aliases', 'description'], defaultMessage: description }),
    ).not.toThrow()
    expect(
      translate({ id: ['module', 'admin', 'entities', 'field', 'catalog_entity_aliases', 'description'], defaultMessage: description }),
    ).toBe(description)
  })

  it('still formats what is valid ICU', () => {
    expect(translate('{count, plural, one {# row} other {# rows}}', { count: 2 })).toBe('2 rows')
    expect(translate('Delete {label}?', { label: 'Orders' })).toBe('Delete Orders?')
  })
})
