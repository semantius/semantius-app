import { describe, expect, it } from 'vitest'
import { TITLE_SUFFIX, pageTitle } from './pageTitle'

/**
 * 2.4.2 Page Titled. The failure this guards is not a wrong string, it is a
 * SHARED one: before per-route `head()`s existed, all 19 routes rendered the
 * single static `<title>` from index.html, producing a browser history and a row
 * of tabs in which no two pages could be told apart.
 */
describe('pageTitle', () => {
  it('puts the page name first, so it survives truncation in a tab', () => {
    expect(pageTitle('Customers')).toBe(`Customers · ${TITLE_SUFFIX}`)
  })

  it('falls back to the product name alone when a route has no page name', () => {
    expect(pageTitle()).toBe(TITLE_SUFFIX)
  })

  it('treats an empty page name as absent rather than emitting a dangling separator', () => {
    expect(pageTitle('')).toBe(TITLE_SUFFIX)
  })

  it('never produces the same title for two different page names', () => {
    expect(pageTitle('Customers')).not.toBe(pageTitle('Orders'))
  })
})
