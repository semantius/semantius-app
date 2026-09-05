import { describe, expect, it } from 'vitest'
import { moduleHomePath } from './moduleHome'

/**
 * This exists so a module tile can be a real `<a href>` instead of a div with an
 * onClick — the difference between an element that is keyboard reachable,
 * focus-ringed, announced as a link and openable in a new tab, and one that is
 * none of those (2.1.1, 2.4.7).
 *
 * `home_page` is authored data, so the blank-ish cases are the ones that matter:
 * every one of them has to produce a usable path, never `undefined` and never a
 * bare `/` that navigates out of the module.
 */
describe('moduleHomePath', () => {
  it('uses an authored home page when there is one', () => {
    expect(moduleHomePath({ home_page: '/crm/home', module_slug: 'crm' })).toBe('/crm/home')
  })

  it('falls back to the module root when home_page is absent', () => {
    expect(moduleHomePath({ module_slug: 'crm' })).toBe('/crm')
  })

  it.each(['', '   ', '/', ' / '])(
    'treats %o as "no custom landing page" rather than a destination',
    (home_page) => {
      expect(moduleHomePath({ home_page, module_slug: 'crm' })).toBe('/crm')
    },
  )

  it('trims surrounding whitespace off an authored path', () => {
    expect(moduleHomePath({ home_page: '  /crm/home  ', module_slug: 'crm' })).toBe('/crm/home')
  })

  it('always returns an absolute path', () => {
    const cases = [
      { home_page: '/crm/home', module_slug: 'crm' },
      { home_page: '', module_slug: 'crm' },
      { module_slug: 'admin' },
    ]
    for (const module of cases) {
      expect(moduleHomePath(module).startsWith('/')).toBe(true)
    }
  })
})
