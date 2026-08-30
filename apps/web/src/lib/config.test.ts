import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initConfig, getConfigError } from './config'

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
