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

  it('strips the braces out of MODEL text, keeping what is inside them', () => {
    // The real description of `entities.catalog_entity_aliases` on the test
    // tenant. ICU reads `{alias_code, source_domain, …}` as an argument named
    // alias_code with the format type source_domain, and Lingui has no such
    // formatter — that was "formatter is not a function", at render, inside a
    // route. A metadata message never receives values, so the braces cannot be
    // a placeholder and are removed at the point model text becomes a message.
    // This used to assert the description came back UNCHANGED: rendering was
    // safe, but the braces then travelled into the discovered source, into
    // `en-US.json`, into the work file, and back out as something the importer
    // demanded of the translation.
    const id = ['module', 'admin', 'entities', 'field', 'catalog_entity_aliases', 'description'] as const
    const description =
      'Reuse/merge record: JSON array of {alias_code, source_domain, source_module, decided}. Append-only. Empty array = never a merge target.'

    const rendered = translate({ id: [...id], defaultMessage: description })

    expect(rendered).toBe(
      'Reuse/merge record: JSON array of alias_code, source_domain, source_module, decided. Append-only. Empty array = never a merge target.',
    )
    expect(rendered).not.toContain('{')
    expect(rendered).not.toContain('}')
  })

  it('leaves a plain server sentence exactly as the server said it', () => {
    // Verbatim too, but for the opposite reason: that is PostgreSQL's own text
    // and a brace in it is the server's, not ours to edit.
    const sentence = 'value {1,2} violates check constraint'
    expect(translate({ id: ['23514', 'orders_qty_check'], defaultMessage: sentence })).toBe(sentence)
  })

  it('renders a code string that cannot be formatted verbatim instead of throwing', () => {
    // A code string IS ICU, so nothing is stripped and the compiler's guard is
    // what keeps the screen up.
    const broken = 'Between {a, whoops} and {b}'
    expect(() => translate(broken)).not.toThrow()
    expect(translate(broken)).toBe(broken)
  })

  it('still formats what is valid ICU', () => {
    expect(translate('{count, plural, one {# row} other {# rows}}', { count: 2 })).toBe('2 rows')
    expect(translate('Delete {label}?', { label: 'Orders' })).toBe('Delete Orders?')
  })
})
