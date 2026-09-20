import { describe, expect, it } from 'vitest'
import { exceedsWordLimit, LONG_DESCRIPTION_WORD_LIMIT } from './fieldDescriptionLayout'

describe('exceedsWordLimit', () => {
  it('keeps six words inline — width, not a character quota, decides wrapping', () => {
    expect(exceedsWordLimit('one two three four five six')).toBe(false)
    expect(LONG_DESCRIPTION_WORD_LIMIT).toBe(6)
  })

  it('collapses more than six words even on a wide field', () => {
    expect(exceedsWordLimit('one two three four five six seven')).toBe(true)
  })

  it('does not treat a long single token as a word-count overflow', () => {
    expect(exceedsWordLimit('a'.repeat(80))).toBe(false)
  })

  it('treats missing or empty text as short', () => {
    expect(exceedsWordLimit()).toBe(false)
    expect(exceedsWordLimit('')).toBe(false)
  })
})
