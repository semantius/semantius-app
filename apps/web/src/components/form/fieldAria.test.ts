import { describe, expect, it } from 'vitest'
import { describedBy, descriptionId, errorId, labelId, labelledBy } from './fieldAria'

/**
 * `fieldAria` is the contract all 29 form controls depend on, and every one of
 * its branches is a real accessibility failure when it goes wrong:
 *
 * - emitting an id for an element that is not rendered is an
 *   `aria-valid-attr-value` violation (axe fails the page);
 * - returning `''` instead of `undefined` is the same violation with a different
 *   shape — React renders `aria-describedby=""`, which is present-and-dangling;
 * - dropping the description when there is also an error leaves a user who hears
 *   "must not be empty" without the instructions that would let them fix it.
 *
 * So these are not tests of a string formatter. They are the only place the
 * agreement between `describedBy()`, `FormDescription` and `FormError` about
 * WHEN each element exists is written down executably.
 */
describe('describedBy', () => {
  it('references the description alone when there is no error', () => {
    expect(describedBy('email', { description: 'Work address' })).toBe('email-description')
  })

  it('references the error alone when there is no description', () => {
    expect(describedBy('email', { error: 'Required' })).toBe('email-error')
  })

  it('references BOTH — they are additive, never a choice', () => {
    expect(describedBy('email', { description: 'Work address', error: 'Required' })).toBe(
      'email-description email-error',
    )
  })

  it('is undefined — not an empty string — when neither exists', () => {
    const result = describedBy('email', {})
    expect(result).toBeUndefined()
    // Spelled out because `''` is falsy and would slip past a loose assertion,
    // while React still renders the attribute for it.
    expect(result).not.toBe('')
  })

  it('treats an empty-string description or error as absent', () => {
    expect(describedBy('email', { description: '', error: '' })).toBeUndefined()
  })

  describe('view mode', () => {
    // SchemaForm forces inputMode='readonly' in view mode but still RENDERS the
    // control, while FormDescription and FormError both return null. Anything
    // emitted here would dangle on every read-only record and for every user
    // without edit permission.
    it('emits nothing even when a description exists', () => {
      expect(describedBy('email', { description: 'Work address', formMode: 'view' })).toBeUndefined()
    })

    it('emits nothing even when an error exists', () => {
      expect(describedBy('email', { error: 'Required', formMode: 'view' })).toBeUndefined()
    })
  })

  it.each(['edit', 'create'] as const)('emits normally in %s mode', (formMode) => {
    expect(describedBy('email', { description: 'Work address', formMode })).toBe('email-description')
  })
})

describe('labelledBy', () => {
  // For a <button> trigger or a CodeMirror content div, `<label for>` does not
  // associate, so the reference has to run the other way — but only when there
  // is a label to point at.
  it('points at the label element when the field has a label', () => {
    expect(labelledBy('email', 'Email')).toBe('email-label')
  })

  it('is undefined when there is no label, rather than dangling', () => {
    expect(labelledBy('email')).toBeUndefined()
    expect(labelledBy('email', '')).toBeUndefined()
  })
})

describe('id helpers agree with the ids describedBy emits', () => {
  it('derives every id from the field name in one place', () => {
    expect(descriptionId('email')).toBe('email-description')
    expect(errorId('email')).toBe('email-error')
    expect(labelId('email')).toBe('email-label')
    expect(describedBy('email', { description: 'd', error: 'e' })).toBe(
      `${descriptionId('email')} ${errorId('email')}`,
    )
  })
})
