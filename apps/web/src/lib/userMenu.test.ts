import { describe, it, expect } from 'vitest'
import { parseBackendType, resolveUserMenu, isExternalUrl } from './userMenu'

/** Narrow a resolution result to its success branch, failing loudly otherwise. */
function menuOf(result: ReturnType<typeof resolveUserMenu>) {
  if ('error' in result) throw new Error(`expected a menu, got error: ${result.error}`)
  return result.menu
}

/** Narrow a resolution result to its error branch. */
function errorOf(result: ReturnType<typeof resolveUserMenu>) {
  if (!('error' in result)) throw new Error('expected an error, got a menu')
  return result.error
}

describe('parseBackendType', () => {
  it('defaults to cloud when unset or empty', () => {
    expect(parseBackendType(undefined)).toBe('cloud')
    expect(parseBackendType('')).toBe('cloud')
    expect(parseBackendType('   ')).toBe('cloud')
  })

  it('accepts the three known values, trimming whitespace', () => {
    expect(parseBackendType('cloud')).toBe('cloud')
    expect(parseBackendType('self_hosted')).toBe('self_hosted')
    expect(parseBackendType(' custom ')).toBe('custom')
  })

  it('rejects anything else, including a differently-cased value', () => {
    expect(parseBackendType('selfhosted')).toBeNull()
    expect(parseBackendType('Cloud')).toBeNull()
    expect(parseBackendType('SELF_HOSTED')).toBeNull()
  })
})

describe('resolveUserMenu — built-in menus', () => {
  it('substitutes {orgid} with the org slug on the cloud menu', () => {
    const menu = menuOf(resolveUserMenu('cloud', undefined, 'acme'))

    expect(menu.map((e) => e.title)).toEqual(['Settings', 'Profile', 'Platform'])
    // 'Settings' is a RELATIVE in-app route: the tenant is already implied by
    // the host, so it carries no {orgid} to substitute. Only the absolute
    // control-plane links hold the placeholder.
    expect(menu[0].url).toBe('/settings')
    expect(menu[1].url).toBe('https://app.semantius.com/settings?orgid=acme')
    expect(menu[2].url).toBe('https://app.semantius.com/settings/organization?orgid=acme')
    expect(menu[2].permission).toBe('admin')
  })

  it('collapses {orgid} to an empty string when there is no slug', () => {
    const menu = menuOf(resolveUserMenu('cloud', undefined, undefined))

    expect(menu[0].url).toBe('/settings')
    expect(menu[1].url).toBe('https://app.semantius.com/settings?orgid=')
    expect(menu.every((e) => !e.url.includes('{orgid}'))).toBe(true)
  })

  it('never mutates the built-ins — a second call is not poisoned by the first', () => {
    menuOf(resolveUserMenu('cloud', undefined, 'first'))
    const second = menuOf(resolveUserMenu('cloud', undefined, 'second'))

    // Must assert on a placeholder-bearing entry: menu[0] is a constant, so it
    // would pass even if resolveUserMenu HAD poisoned the built-ins in place.
    expect(second[1].url).toBe('https://app.semantius.com/settings?orgid=second')
  })

  it('serves the self_hosted menu and ignores any customizer JSON', () => {
    const menu = menuOf(
      resolveUserMenu('self_hosted', '{"user":{"menu":[{"title":"Ignored","url":"/nope"}]}}', 'acme'),
    )

    expect(menu).toEqual([
      { title: 'Account', url: '/idp/account' },
      { title: 'User Manager', url: '/idp/admin', permission: 'admin' },
    ])
  })
})

describe('resolveUserMenu — custom', () => {
  const valid =
    '{"user":{"menu":[{"title":"Account","url":"/idp/account"},' +
    '{"title":"Org","url":"https://example.com/org?orgid={orgid}","permission":"admin"}]}}'

  it('parses a valid customizer and substitutes {orgid}', () => {
    const menu = menuOf(resolveUserMenu('custom', valid, 'acme'))

    expect(menu).toEqual([
      { title: 'Account', url: '/idp/account' },
      { title: 'Org', url: 'https://example.com/org?orgid=acme', permission: 'admin' },
    ])
  })

  it('errors, naming VITE_UI_CUSTOMIZER, when the customizer is missing or blank', () => {
    expect(errorOf(resolveUserMenu('custom', undefined, 'acme'))).toContain('VITE_UI_CUSTOMIZER')
    expect(errorOf(resolveUserMenu('custom', '   ', 'acme'))).toContain('VITE_UI_CUSTOMIZER')
  })

  it('errors on malformed JSON', () => {
    const error = errorOf(resolveUserMenu('custom', '{"user":', 'acme'))

    expect(error).toContain('VITE_UI_CUSTOMIZER')
    expect(error).toContain('not valid JSON')
  })

  it('errors when user.menu is absent', () => {
    expect(errorOf(resolveUserMenu('custom', '{"user":{}}', 'acme'))).toContain('user.menu')
    expect(errorOf(resolveUserMenu('custom', '{}', 'acme'))).toContain('"user"')
    expect(errorOf(resolveUserMenu('custom', '[]', 'acme'))).toContain('VITE_UI_CUSTOMIZER')
  })

  it('names the first bad entry by index', () => {
    const json = '{"user":{"menu":[{"title":"Ok","url":"/ok"},{"title":"Broken"}]}}'
    const error = errorOf(resolveUserMenu('custom', json, 'acme'))

    expect(error).toContain('entry 1')
    expect(error).toContain('"url"')
  })

  it('rejects a non-string permission', () => {
    const json = '{"user":{"menu":[{"title":"Ok","url":"/ok","permission":7}]}}'

    expect(errorOf(resolveUserMenu('custom', json, 'acme'))).toContain('"permission"')
  })

  it('accepts an empty menu — an operator may want no account entries at all', () => {
    expect(menuOf(resolveUserMenu('custom', '{"user":{"menu":[]}}', 'acme'))).toEqual([])
  })
})

describe('isExternalUrl', () => {
  it('is true for absolute http(s) URLs, in any casing', () => {
    expect(isExternalUrl('https://app.semantius.com/settings')).toBe(true)
    expect(isExternalUrl('http://example.com')).toBe(true)
    expect(isExternalUrl('HTTPS://EXAMPLE.COM')).toBe(true)
  })

  it('is false for in-app paths', () => {
    expect(isExternalUrl('/settings?orgid=acme')).toBe(false)
    expect(isExternalUrl('/idp/admin')).toBe(false)
    expect(isExternalUrl('settings')).toBe(false)
  })
})
