import { describe, expect, it } from 'vitest'
import { compareText, jsonbText, recordIdText } from './jsonLogic'

describe('jsonbText writes a value as PostgreSQL writes jsonb as text', () => {
  // Every expected value is `'<json>'::jsonb::text` for the same JSON (postgres18-ext).
  it.each([
    [[1, [2, { a: null, b: 'x"y' }], true], '[1, [2, {"a": null, "b": "x\\"y"}], true]'],
    [{ b: 1, a: 2 }, '{"a": 2, "b": 1}'],
    [{ aa: 1, b: 2 }, '{"b": 2, "aa": 1}'],
    // A key's length is counted in UTF-8 bytes: é is two, so it sorts after b.
    [{ é: 1, b: 2 }, '{"b": 2, "é": 1}'],
    [{ é: 1, ab: 2 }, '{"ab": 2, "é": 1}'],
    [1e21, '1000000000000000000000'],
    [1e-7, '0.0000001'],
    [-1.5e-3, '-0.0015'],
  ])('%j is %s', (value, text) => {
    expect(jsonbText(value)).toBe(text)
  })
})

describe('compareText orders by code point, as COLLATE "C" does', () => {
  it('sorts a character above U+FFFF after one below it', () => {
    expect(compareText('😀', 'Ａ')).toBe(1)
    expect(compareText('Ａ', '😀')).toBe(-1)
  })

  it('sorts a prefix first and an equal text as equal', () => {
    expect(compareText('ab', 'abc')).toBe(-1)
    expect(compareText('abc', 'ab')).toBe(1)
    expect(compareText('ab', 'ab')).toBe(0)
  })
})

describe('recordIdText is the id a set_record hands the backend', () => {
  it('keeps text, writes anything else as jsonb text, and has no id for null', () => {
    expect(recordIdText('ALFKI')).toBe('ALFKI')
    expect(recordIdText(5)).toBe('5')
    expect(recordIdText([5])).toBe('[5]')
    expect(recordIdText(null)).toBeNull()
  })
})
