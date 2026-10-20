import { describe, it, expect } from 'vitest'
import { mergeFeatures, parseFeatureList } from './features'

describe('parseFeatureList', () => {
  it('splits on commas and trims each item', () => {
    expect(parseFeatureList(' alpha,beta , gamma ')).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('drops empty items', () => {
    expect(parseFeatureList('alpha,, ,beta,')).toEqual(['alpha', 'beta'])
  })

  it('answers an empty list for an unset or blank value', () => {
    expect(parseFeatureList(undefined)).toEqual([])
    expect(parseFeatureList('')).toEqual([])
    expect(parseFeatureList('  ')).toEqual([])
  })
})

describe('mergeFeatures', () => {
  it('unions the lists, keeping first-seen order', () => {
    expect(mergeFeatures(['alpha', 'beta'], ['beta', 'gamma'])).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('treats a null or undefined list as empty', () => {
    expect(mergeFeatures(['alpha'], null)).toEqual(['alpha'])
    expect(mergeFeatures(undefined, ['beta'])).toEqual(['beta'])
  })
})
