import { describe, it, expect } from 'vitest'
import { parseUiCustomizer } from '@/lib/userMenu'
import { defaultLocaleUrl, resolveLocales } from './localeConfig'

/** Parse then resolve, the way lib/config.ts composes the two. */
function resolve(raw: string | undefined) {
  const parsed = parseUiCustomizer(raw)
  if ('error' in parsed) return parsed
  return resolveLocales(parsed.value)
}

function localesOf(result: ReturnType<typeof resolve>) {
  if ('error' in result) throw new Error(`expected locales, got error: ${result.error}`)
  return result.locales
}

function errorOf(result: ReturnType<typeof resolve>) {
  if (!('error' in result)) throw new Error('expected an error, got locales')
  return result.error
}

describe('resolveLocales', () => {
  it('answers nothing configured for an absent customizer', () => {
    expect(localesOf(resolve(undefined))).toEqual({ default: undefined, available: [] })
    expect(localesOf(resolve('   '))).toEqual({ default: undefined, available: [] })
  })

  it('answers nothing configured for a customizer that only carries a menu', () => {
    const raw = '{"user":{"menu":[{"title":"Account","url":"/idp/account"}]}}'

    expect(localesOf(resolve(raw))).toEqual({ default: undefined, available: [] })
  })

  it('reads the default and the registered files', () => {
    const raw =
      '{"locales":{"default":"de-DE","available":[' +
      '{"code":"fr-FR","name":"Français","url":"/locales/fr-FR.json"},' +
      '{"code":"nl-NL"}]}}'

    expect(localesOf(resolve(raw))).toEqual({
      default: 'de-DE',
      available: [
        { code: 'fr-FR', name: 'Français', url: '/locales/fr-FR.json' },
        // No url given: the convention, so a registration is one word.
        { code: 'nl-NL', name: undefined, url: '/locales/nl-NL.json' },
      ],
    })
  })

  it('does not require a menu — an operator on a built-in menu may still add a language', () => {
    const raw = '{"locales":{"available":[{"code":"fr-FR"}]}}'

    expect(localesOf(resolve(raw)).available.map((entry) => entry.code)).toEqual(['fr-FR'])
  })

  it('trims the values an operator hand-edited into a .env', () => {
    const raw = '{"locales":{"default":" de-DE ","available":[{"code":" fr-FR ","name":" Français ","url":" /l/fr.json "}]}}'
    const locales = localesOf(resolve(raw))

    expect(locales.default).toBe('de-DE')
    expect(locales.available).toEqual([{ code: 'fr-FR', name: 'Français', url: '/l/fr.json' }])
  })

  it('rejects a locales section that is not an object', () => {
    expect(errorOf(resolve('{"locales":[]}'))).toContain('"locales"')
    expect(errorOf(resolve('{"locales":"de-DE"}'))).toContain('"locales"')
  })

  it('rejects a non-string default and a non-array available', () => {
    expect(errorOf(resolve('{"locales":{"default":7}}'))).toContain('locales.default')
    expect(errorOf(resolve('{"locales":{"default":""}}'))).toContain('locales.default')
    expect(errorOf(resolve('{"locales":{"available":{}}}'))).toContain('locales.available')
  })

  it('names the first bad registration by index', () => {
    const raw = '{"locales":{"available":[{"code":"fr-FR"},{"name":"No code"}]}}'
    const error = errorOf(resolve(raw))

    expect(error).toContain('entry 1')
    expect(error).toContain('"code"')
  })

  it('rejects a non-string name or url', () => {
    expect(errorOf(resolve('{"locales":{"available":[{"code":"fr-FR","name":7}]}}'))).toContain('"name"')
    expect(errorOf(resolve('{"locales":{"available":[{"code":"fr-FR","url":true}]}}'))).toContain('"url"')
  })

  it('rejects a repeated code, which would silently drop the second file', () => {
    const raw = '{"locales":{"available":[{"code":"fr-FR"},{"code":"fr-FR","url":"/other.json"}]}}'

    expect(errorOf(resolve(raw))).toContain('repeats the code "fr-FR"')
  })

  it('reports malformed JSON through the shared parser, naming the variable', () => {
    const error = errorOf(resolve('{"locales":'))

    expect(error).toContain('VITE_UI_CUSTOMIZER')
    expect(error).toContain('not valid JSON')
  })
})

describe('defaultLocaleUrl', () => {
  it('is the convention the docs and the nginx rule both name', () => {
    expect(defaultLocaleUrl('fr-FR')).toBe('/locales/fr-FR.json')
  })

  it('encodes a code so a hand-edited tag cannot escape the folder', () => {
    expect(defaultLocaleUrl('../etc/passwd')).toBe('/locales/..%2Fetc%2Fpasswd.json')
  })
})
