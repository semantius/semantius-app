import { afterEach, describe, expect, it } from 'vitest'
import {
  descriptionOverflowsField,
  fieldColumnElement,
} from './fieldDescriptionLayout'

/**
 * Live-width measurement has to run in Chromium: the probe reads offsetWidth
 * against the field's clientWidth. A character quota would make these two
 * cases the same; a 40px column and a 400px column must disagree.
 */
describe('descriptionOverflowsField', () => {
  const fields: HTMLElement[] = []

  afterEach(() => {
    for (const el of fields) el.remove()
    fields.length = 0
  })

  function field(widthPx: number): HTMLDivElement {
    const el = document.createElement('div')
    el.style.width = `${widthPx}px`
    document.body.appendChild(el)
    fields.push(el)
    return el
  }

  it('collapses a two-word hint that does not fit a narrow column', () => {
    expect(descriptionOverflowsField('Work address', field(40))).toBe(true)
  })

  it('keeps the same two-word hint inline on a wide column', () => {
    expect(descriptionOverflowsField('Work address', field(400))).toBe(false)
  })

  it('does not use forty characters as the threshold', () => {
    const fortyPlus = 'Internationalization configuration helper'
    expect(fortyPlus.length).toBeGreaterThan(40)
    expect(descriptionOverflowsField(fortyPlus, field(400))).toBe(false)
    expect(descriptionOverflowsField(fortyPlus, field(40))).toBe(true)
  })
})

describe('fieldColumnElement', () => {
  it('prefers the SchemaForm span cell over a row-span ancestor', () => {
    const card = document.createElement('div')
    card.className = 'row-span-2'
    const cell = document.createElement('div')
    cell.className = 'span-2'
    const host = document.createElement('div')
    card.appendChild(cell)
    cell.appendChild(host)
    document.body.appendChild(card)
    try {
      expect(fieldColumnElement(host)).toBe(cell)
    } finally {
      card.remove()
    }
  })
})
