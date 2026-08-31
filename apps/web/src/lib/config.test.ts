import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initConfig, getConfig, getConfigError } from './config'

const realCrypto = globalThis.crypto

/** A browser that can actually run the PKCE flow. */
function secureBrowser() {
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('crypto', {
    getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
    subtle: {},
  })
}

describe('initConfig — secure-context precheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('records a config error naming the origin when the context is not secure', async () => {
    vi.stubGlobal('isSecureContext', false)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await initConfig()

    const err = getConfigError()
    expect(err).toContain(window.location.origin)
    expect(err).toContain('crypto.subtle')
    // The precheck must short-circuit: there is no point resolving endpoints for
    // a flow the browser cannot perform.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('records the same error when crypto.subtle is missing despite a secure context', async () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('crypto', { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) })
    vi.stubGlobal('fetch', vi.fn())

    await initConfig()

    expect(getConfigError()).toContain('crypto.subtle')
  })

  it('does not block boot in a secure context', async () => {
    secureBrowser()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await initConfig()

    // It got past the precheck and on to the tenant lookup — whatever that
    // reports, it is not the secure-context error.
    const err = getConfigError()
    expect(err).not.toContain('crypto.subtle')
    expect(err).toContain('Tenant lookup failed')
  })
})

describe('initConfig — configurable user menu', () => {
  /**
   * The two new vars are read through runtimeEnv(), which consults
   * window.__ENV__ before the Vite-inlined build-time value — so setting that
   * object is how a test drives them without stubbing import.meta.env.
   */
  function env(values: Record<string, string>) {
    window.__ENV__ = values
  }

  /** A control plane that answers with a well-formed tenant. */
  function tenantFetch(name: string) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({
        id: 'tenant-1',
        client_id: 'client-1',
        name,
        logo: null,
        postgrest_url: 'https://api.example.com',
      }),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    secureBrowser()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete window.__ENV__
  })

  it('defaults to the cloud menu with the tenant slug substituted for {orgid}', async () => {
    vi.stubGlobal('fetch', tenantFetch('acme'))

    await initConfig()

    expect(getConfigError()).toBeNull()
    expect(getConfig().backendType).toBe('cloud')
    const menu = getConfig().uiCustomizer.user.menu
    expect(menu.map((e) => e.title)).toEqual(['Settings', 'Profile', 'Platform'])
    // 'Settings' is an IN-APP relative route, so it carries no {orgid} to
    // substitute — the tenant is already implied by the host. Substitution is
    // asserted on the entries that actually hold the placeholder: the absolute
    // control-plane links.
    expect(menu[0].url).toBe('/settings')
    expect(menu[1].url).toBe('https://app.semantius.com/settings?orgid=acme')
    expect(menu[2].url).toBe(
      'https://app.semantius.com/settings/organization?orgid=acme'
    )
    expect(menu.some((e) => e.url.includes('{orgid}'))).toBe(false)
  })

  it('blocks boot when VITE_BACKEND_TYPE=custom has no VITE_UI_CUSTOMIZER', async () => {
    env({ VITE_BACKEND_TYPE: 'custom' })
    vi.stubGlobal('fetch', tenantFetch('acme'))

    await initConfig()

    expect(getConfigError()).toContain('VITE_UI_CUSTOMIZER')
  })

  it('blocks boot on an unrecognised VITE_BACKEND_TYPE, listing the valid values', async () => {
    env({ VITE_BACKEND_TYPE: 'selfhosted' })
    vi.stubGlobal('fetch', tenantFetch('acme'))

    await initConfig()

    const err = getConfigError()
    expect(err).toContain('VITE_BACKEND_TYPE')
    expect(err).toContain('self_hosted')
  })

  it('resolves a custom menu, substituting the slug', async () => {
    env({
      VITE_BACKEND_TYPE: 'custom',
      VITE_UI_CUSTOMIZER:
        '{"user":{"menu":[{"title":"Org","url":"/org?orgid={orgid}","permission":"admin"}]}}',
    })
    vi.stubGlobal('fetch', tenantFetch('acme'))

    await initConfig()

    expect(getConfigError()).toBeNull()
    expect(getConfig().uiCustomizer.user.menu).toEqual([
      { title: 'Org', url: '/org?orgid=acme', permission: 'admin' },
    ])
  })

  it('does not clobber an earlier failure — the tenant error is the useful one', async () => {
    env({ VITE_BACKEND_TYPE: 'nonsense' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await initConfig()

    expect(getConfigError()).toContain('Tenant lookup failed')
  })
})

describe('initConfig — OIDC discovery (self-hosted)', () => {
  function env(values: Record<string, string>) {
    window.__ENV__ = values
  }

  /** A discovery document the bundled IdP would serve. */
  function discoveryFetch() {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        authorization_endpoint: 'https://b.example.com/oauth2/authorize',
        token_endpoint: 'https://b.example.com/oauth2/token',
        userinfo_endpoint: 'https://b.example.com/oauth2/userinfo',
        scopes_supported: ['openid', 'profile', 'email'],
      }),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    secureBrowser()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete window.__ENV__
  })

  it('fetches a RELATIVE VITE_OAUTH_CONFIG as an absolute URL on this origin', async () => {
    // Load-bearing, not cosmetic: apiClient.ts wraps globalThis.fetch and
    // rewrites every URL starting with "/" — prefixing VITE_API_BASE_URL and
    // consulting getConfig(), which THROWS while initConfig() is still
    // running. The self-hosted stack ships exactly this relative value, so a
    // discovery fetch that ever leaves here relative is a blocked boot:
    // "OIDC discovery failed: App config not initialized…".
    const fetchSpy = discoveryFetch()
    vi.stubGlobal('fetch', fetchSpy)
    env({
      VITE_CONTROL_PLANE_URL: ' ', // the documented self-hosted opt-out
      VITE_OAUTH_CONFIG: '/.well-known/openid-configuration',
    })

    await initConfig()

    expect(getConfigError()).toBeNull()
    expect(fetchSpy).toHaveBeenCalledWith(
      `${window.location.origin}/.well-known/openid-configuration`
    )
    expect(getConfig().oauthAuthEndpoint).toBe(
      'https://b.example.com/oauth2/authorize'
    )
    expect(getConfig().oauthTokenEndpoint).toBe(
      'https://b.example.com/oauth2/token'
    )
  })

  it('passes an absolute VITE_OAUTH_CONFIG through unchanged', async () => {
    const fetchSpy = discoveryFetch()
    vi.stubGlobal('fetch', fetchSpy)
    env({
      VITE_CONTROL_PLANE_URL: ' ',
      VITE_OAUTH_CONFIG:
        'https://issuer.example.com/.well-known/openid-configuration',
    })

    await initConfig()

    expect(getConfigError()).toBeNull()
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://issuer.example.com/.well-known/openid-configuration'
    )
  })
})
