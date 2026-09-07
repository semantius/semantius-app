import { describe, expect, it } from 'vitest'
import { SOURCE_LANGUAGE } from './catalog'
import { matchLanguage, resolveLocale, type LocaleSources } from './resolveLocale'

/**
 * The resolution decides two things from five sources, and every source but one
 * only exists in a state this suite cannot otherwise reach: a session preference
 * needs a platform that does not have the columns yet, an operator default needs
 * a customizer, and a browser placeholder needs a browser whose language is not
 * the machine's. So the decision itself is a pure function over its inputs, and
 * this is the only place every combination is exercised.
 *
 * Nothing here stubs `navigator` or `localStorage`. The two functions that DO
 * read them (`resolveInitialLocale`, `resolvePlaceholderLocale`) are thin
 * wrappers around this, and they are exercised for real in the browser project
 * through the account menu.
 */

const AVAILABLE = [SOURCE_LANGUAGE, 'de-DE', 'fr-FR']

/** Only `available` is required; every test names just the sources it is about. */
function resolve(sources: Partial<LocaleSources> = {}) {
  return resolveLocale({ available: AVAILABLE, ...sources })
}

describe('matchLanguage', () => {
  it('prefers an exact tag', () => {
    expect(matchLanguage('de-DE', AVAILABLE)).toBe('de-DE')
  })

  it('falls back to the language subtag, so de-AT reaches the German catalog', () => {
    expect(matchLanguage('de-AT', AVAILABLE)).toBe('de-DE')
    expect(matchLanguage('de', AVAILABLE)).toBe('de-DE')
  })

  it('ignores case, because a stored tag is not normalized', () => {
    expect(matchLanguage('DE-de', AVAILABLE)).toBe('de-DE')
  })

  it('answers undefined for a language with no catalog', () => {
    // Preview origins share one localStorage across tenants, so a saved language
    // really can name a catalog this deployment does not have.
    expect(matchLanguage('ja-JP', AVAILABLE)).toBeUndefined()
    expect(matchLanguage('', AVAILABLE)).toBeUndefined()
    expect(matchLanguage(null, AVAILABLE)).toBeUndefined()
  })
})

describe('resolveLocale — language', () => {
  it('takes the session preference over everything else', () => {
    const resolved = resolve({
      sessionLanguage: 'de-DE',
      cachedLanguage: 'fr-FR',
      operatorDefault: 'fr-FR',
      browserLanguages: ['fr-FR'],
    })

    expect(resolved.language).toBe('de-DE')
    expect(resolved.languageSource).toBe('session')
  })

  it('takes the per-browser cache when there is no session preference', () => {
    const resolved = resolve({ cachedLanguage: 'de-DE', operatorDefault: 'fr-FR', browserLanguages: ['fr-FR'] })

    expect(resolved).toMatchObject({ language: 'de-DE', languageSource: 'cache' })
  })

  it("takes the operator's default over the browser", () => {
    const resolved = resolve({ operatorDefault: 'de-DE', browserLanguages: ['fr-FR'] })

    expect(resolved).toMatchObject({ language: 'de-DE', languageSource: 'operator' })
  })

  it('falls through to the browser, in the order the browser lists', () => {
    const resolved = resolve({ browserLanguages: ['ja-JP', 'fr-FR', 'de-DE'] })

    // ja-JP has no catalog, so it is skipped rather than ending the search.
    expect(resolved).toMatchObject({ language: 'fr-FR', languageSource: 'browser' })
  })

  it('matches a browser language by subtag', () => {
    expect(resolve({ browserLanguages: ['de-CH'] })).toMatchObject({
      language: 'de-DE',
      languageSource: 'browser',
    })
  })

  it('ends at the source language, marked as a default rather than a choice', () => {
    expect(resolve({ browserLanguages: ['ja-JP'] })).toMatchObject({
      language: SOURCE_LANGUAGE,
      languageSource: 'default',
    })
  })

  it('treats a preference for an unavailable language as absent, not as an error', () => {
    // The switcher then shows the placeholder as checked, which is the truth:
    // the saved language is not what the user is looking at.
    const resolved = resolve({ cachedLanguage: 'ja-JP', browserLanguages: ['de-DE'] })

    expect(resolved).toMatchObject({ language: 'de-DE', languageSource: 'browser' })
  })
})

describe('resolveLocale — formatting locale', () => {
  it('takes the session preference first, then the cache, then the browser', () => {
    expect(
      resolve({ sessionLocale: 'de-CH', cachedLocale: 'fr-FR', browserLocale: 'en-GB' }),
    ).toMatchObject({ locale: 'de-CH', localeSource: 'session' })
    expect(resolve({ cachedLocale: 'fr-FR', browserLocale: 'en-GB' })).toMatchObject({
      locale: 'fr-FR',
      localeSource: 'cache',
    })
    expect(resolve({ browserLocale: 'en-GB' })).toMatchObject({
      locale: 'en-GB',
      localeSource: 'browser',
    })
  })

  it('is NOT restricted to the languages that have a catalog', () => {
    // The formatting locale drives Intl, not the catalog: a German UI in Zurich
    // is de-DE text with de-CH numbers, and de-CH will never be a catalog.
    expect(resolve({ cachedLocale: 'de-CH' })).toMatchObject({ locale: 'de-CH', localeSource: 'cache' })
  })

  it('rejects a malformed tag rather than handing it to Intl', () => {
    // Every Intl constructor throws a RangeError on a bad tag, and this value
    // comes out of a localStorage that preview origins share across tenants.
    expect(() => new Intl.NumberFormat('not a locale')).toThrow(RangeError)
    expect(resolve({ cachedLocale: 'not a locale', browserLocale: 'en-GB' })).toMatchObject({
      locale: 'en-GB',
      localeSource: 'browser',
    })
  })

  it('ends at the source language when the browser offers nothing', () => {
    expect(resolve()).toMatchObject({ locale: SOURCE_LANGUAGE, localeSource: 'default' })
  })
})

describe('resolveLocale — the two preferences are independent', () => {
  it('does not derive the formatting locale from the language', () => {
    // A cached language with no cached formatting locale takes the BROWSER's
    // locale — not the language's region, which would silently impose German
    // number formats on a Swiss user who only asked for German text.
    const resolved = resolve({ cachedLanguage: 'de-DE', browserLocale: 'de-CH' })

    expect(resolved).toEqual({
      language: 'de-DE',
      locale: 'de-CH',
      languageSource: 'cache',
      localeSource: 'browser',
    })
  })

  it('does not derive the language from the formatting locale', () => {
    const resolved = resolve({ cachedLocale: 'fr-FR', browserLanguages: ['de-DE'] })

    expect(resolved).toMatchObject({ language: 'de-DE', locale: 'fr-FR' })
  })
})
