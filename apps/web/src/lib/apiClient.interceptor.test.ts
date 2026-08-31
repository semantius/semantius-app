import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The global fetch interceptor, around the boot boundary.
 *
 * apiClient.ts replaces globalThis.fetch at module load. These tests import it
 * dynamically AFTER stubbing fetch, so the interceptor wraps the stub and every
 * call it forwards is observable — and vi.resetModules() gives each test a
 * fresh config module whose _config is still null, which is exactly the state
 * the app is in while initConfig() runs.
 */

const realFetch = globalThis.fetch

describe('fetch interceptor — before initConfig() has resolved', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    vi.unstubAllGlobals()
  })

  it('passes a relative fetch through untouched instead of throwing', async () => {
    // The regression: initConfig()'s own OIDC discovery fetch is relative when
    // VITE_OAUTH_CONFIG is origin-relative, and an interceptor that consulted
    // getConfig() here threw "App config not initialized" — a blocked boot on
    // every self-hosted deployment shipping the relative default.
    const spy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', spy)

    await import('./apiClient') // installs the interceptor over the stub

    await expect(
      globalThis.fetch('/.well-known/openid-configuration')
    ).resolves.toEqual({ ok: true })
    expect(spy).toHaveBeenCalledWith('/.well-known/openid-configuration', undefined)
  })

  it('passes an absolute fetch through untouched, as always', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', spy)

    await import('./apiClient')

    await globalThis.fetch('https://issuer.example.com/.well-known/openid-configuration')
    expect(spy).toHaveBeenCalledWith(
      'https://issuer.example.com/.well-known/openid-configuration',
      undefined
    )
  })
})
