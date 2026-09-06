import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initConfig, getConfig, getConfigError } from './config'
import { SELF_HOSTED, clearRuntimeEnv, setRuntimeEnv } from '@/test/runtimeConfig'

/**
 * `initConfig()` against the real control plane and the real identity provider.
 *
 * WHAT CHANGED AND WHY. Every test here used to `vi.stubGlobal('fetch', …)` and
 * hand back an object shaped like a `Response` — `{ ok, status, headers: { get:
 * () => 'application/json' }, json: async () => ({ … }) }`. That is a
 * description of an HTTP response written by whoever needed the assertion to
 * pass, and it cannot be wrong in the ways a real one is: a content-type that
 * has changed, a field the control plane no longer sends, a CORS policy that
 * refuses the request, a discovery document whose keys have moved.
 *
 * The real endpoints are both available to this suite and both cheap:
 * `api.semantius.cloud/organization/<org>` for the tenant, and the OIDC test
 * server — a real provider, one of the two substitutions this suite declares —
 * for discovery. Failures are produced rather than described: an org that does
 * not exist really answers 404.
 *
 * ONE OBSERVATION IS NOT AN ASSERTION ABOUT A RESPONSE. The relative-URL test
 * needs to know WHICH url was fetched, not what came back, and reads that off
 * the browser's own resource timing rather than a spy.
 */

/** A slug the control plane will not have. */
const UNKNOWN_ORG = 'no-such-org-used-by-a-test'

/** The OIDC test server's discovery document — a real provider, really served. */
const DISCOVERY = 'https://test-oidc-server.ma532.workers.dev/.well-known/openid-configuration'

describe('initConfig — secure-context precheck', () => {
  afterEach(() => {
    clearRuntimeEnv()
  })

  it('does not block boot in a secure context', async () => {
    // This suite runs on http://localhost, which IS a secure context, so the
    // interesting direction is that boot is not blocked. The failing direction
    // needs a real non-secure origin (`vite preview` bound to the machine's LAN
    // address, driven by Playwright); stubbing `isSecureContext` here would only
    // assert that the stub was read. The RULE itself is a pure function, tested
    // in `secureContext.test.ts`.
    //
    // That exists: `e2e/non-secure-context.spec.ts`, the `lan` Playwright
    // project, serves the built app from the machine's own LAN address and
    // asserts the short-circuit as a user sees it — the configuration error
    // naming the origin, the boot overlay down, no redirect to a provider.
    setRuntimeEnv({ VITE_CONTROL_PLANE_ORG: UNKNOWN_ORG })

    await initConfig()

    // It got past the precheck and on to the tenant lookup, which really did
    // fail because the org really is not there.
    const err = getConfigError()
    expect(err).not.toContain('crypto.subtle')
    expect(err).toContain('Tenant lookup failed')
    expect(err).toContain('404')
  })
})

describe('initConfig — configurable user menu', () => {
  /**
   * The tenant this suite signs in to. Its slug is what `{orgid}` must be
   * substituted with, so the substitution is asserted against a value the
   * control plane returned rather than one the test made up.
   */
  let slug: string

  beforeEach(async () => {
    clearRuntimeEnv()
    await initConfig()
    slug = getConfig().tenantName!
    expect(slug).toBeTruthy()
  })

  afterEach(() => {
    clearRuntimeEnv()
  })

  it('defaults to the cloud menu with the tenant slug substituted for {orgid}', async () => {
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
    expect(menu[1].url).toBe(`https://app.semantius.com/settings?orgid=${slug}`)
    expect(menu[2].url).toBe(`https://app.semantius.com/settings/organization?orgid=${slug}`)
    expect(menu.some((e) => e.url.includes('{orgid}'))).toBe(false)
  })

  it('blocks boot when VITE_BACKEND_TYPE=custom has no VITE_UI_CUSTOMIZER', async () => {
    setRuntimeEnv({ VITE_BACKEND_TYPE: 'custom' })

    await initConfig()

    expect(getConfigError()).toContain('VITE_UI_CUSTOMIZER')
  })

  it('blocks boot on an unrecognized VITE_BACKEND_TYPE, listing the valid values', async () => {
    setRuntimeEnv({ VITE_BACKEND_TYPE: 'selfhosted' })

    await initConfig()

    const err = getConfigError()
    expect(err).toContain('VITE_BACKEND_TYPE')
    expect(err).toContain('self_hosted')
  })

  it('resolves a custom menu, substituting the slug', async () => {
    setRuntimeEnv({
      VITE_BACKEND_TYPE: 'custom',
      VITE_UI_CUSTOMIZER:
        '{"user":{"menu":[{"title":"Org","url":"/org?orgid={orgid}","permission":"admin"}]}}',
    })

    await initConfig()

    expect(getConfigError()).toBeNull()
    expect(getConfig().uiCustomizer.user.menu).toEqual([
      { title: 'Org', url: `/org?orgid=${slug}`, permission: 'admin' },
    ])
  })

  it('does not clobber an earlier failure — the tenant error is the useful one', async () => {
    setRuntimeEnv({ VITE_BACKEND_TYPE: 'nonsense', VITE_CONTROL_PLANE_ORG: UNKNOWN_ORG })

    await initConfig()

    expect(getConfigError()).toContain('Tenant lookup failed')
  })
})

describe('initConfig — OIDC discovery (self-hosted)', () => {
  afterEach(() => {
    clearRuntimeEnv()
  })

  it('fills the blank endpoints from the provider’s discovery document', async () => {
    setRuntimeEnv({
      VITE_CONTROL_PLANE_URL: SELF_HOSTED,
      VITE_OAUTH_CONFIG: DISCOVERY,
    })

    await initConfig()

    expect(getConfigError()).toBeNull()
    // Whatever the provider currently publishes — read back from the document
    // rather than compared against a copy of it kept here, which would go stale
    // silently the moment the provider moved an endpoint.
    const doc = await (await fetch(DISCOVERY)).json()
    expect(getConfig().oauthAuthEndpoint).toBe(doc.authorization_endpoint)
    expect(getConfig().oauthTokenEndpoint).toBe(doc.token_endpoint)
    expect(getConfig().oauthUserinfoEndpoint).toBe(doc.userinfo_endpoint)
    // scopes_supported drives the scope when VITE_OAUTH_SCOPE is blank.
    expect(getConfig().oauthScope).toContain('openid')
  })

  it('fetches a RELATIVE VITE_OAUTH_CONFIG as an absolute URL on this origin', async () => {
    // Load-bearing, not cosmetic: apiClient.ts wraps globalThis.fetch and
    // rewrites every URL starting with "/" — prefixing VITE_API_BASE_URL and
    // consulting getConfig(), which THROWS while initConfig() is still running.
    // The self-hosted stack ships exactly this relative value, so a discovery
    // fetch that ever leaves here relative is a blocked boot: "OIDC discovery
    // failed: App config not initialized…".
    const relative = '/.well-known/openid-configuration'
    performance.clearResourceTimings()
    setRuntimeEnv({ VITE_CONTROL_PLANE_URL: SELF_HOSTED, VITE_OAUTH_CONFIG: relative })

    await initConfig()

    // The browser's own record of what it requested. Nothing on this origin
    // serves a discovery document, so the fetch fails — but WHERE it went is
    // the whole point, and a relative url would never have reached the network
    // at all.
    // Polled: a resource-timing entry is recorded when the response is
    // complete, which is after initConfig() has already given up on it.
    await expect
      .poll(
        () =>
          performance
            .getEntriesByType('resource')
            .some((entry) => entry.name === `${window.location.origin}${relative}`),
        { timeout: 15000, interval: 100 },
      )
      .toBe(true)
    // The interceptor's signature failure, which is what a relative url causes.
    expect(getConfigError()).not.toContain('App config not initialized')
  })

  it('passes an absolute VITE_OAUTH_CONFIG through unchanged', async () => {
    performance.clearResourceTimings()
    setRuntimeEnv({ VITE_CONTROL_PLANE_URL: SELF_HOSTED, VITE_OAUTH_CONFIG: DISCOVERY })

    await initConfig()

    expect(getConfigError()).toBeNull()
    await expect
      .poll(
        () => performance.getEntriesByType('resource').some((entry) => entry.name === DISCOVERY),
        { timeout: 15000, interval: 100 },
      )
      .toBe(true)
  })

  it('reports a discovery document that is not there, rather than booting half-configured', async () => {
    setRuntimeEnv({
      VITE_CONTROL_PLANE_URL: SELF_HOSTED,
      VITE_OAUTH_CONFIG: 'https://test-oidc-server.ma532.workers.dev/.well-known/not-here',
    })

    await initConfig()

    // A real 404 from a real provider. main.tsx turns this into a blocking boot
    // screen: an app that cannot resolve its OAuth endpoints must say so, not
    // offer a login that goes nowhere.
    expect(getConfigError()).toContain('OIDC discovery failed')
    expect(getConfigError()).toContain('404')
  })
})
