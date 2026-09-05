import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

/**
 * The global fetch interceptor, around the boot boundary.
 *
 * `apiClient.ts` replaces `globalThis.fetch` at module load, capturing whatever
 * fetch was there as the downstream it forwards to. So the downstream spy has to
 * be in place BEFORE the import — which is the whole reason this file imports the
 * module dynamically.
 *
 * It imports it ONCE. The previous version called `vi.resetModules()` before
 * every test so each got a freshly-loaded copy, and re-stubbed fetch each time;
 * but the state under test — `_config` still null, the app mid-`initConfig()` —
 * is a property of `config.ts`, not something a module reload is needed to
 * produce, and reloading a module that patches a global on load leaves a chain of
 * interceptors behind it. One install, then assertions about the installed fetch.
 *
 * Runs in `node`: nothing here touches a document.
 */

const realFetch = globalThis.fetch
const downstream = vi.fn<typeof fetch>()

beforeAll(async () => {
  // Installed before the import, so the interceptor wraps it.
  globalThis.fetch = downstream as unknown as typeof fetch
  await import('./apiClient')
})

afterAll(() => {
  globalThis.fetch = realFetch
})

describe('fetch interceptor — before initConfig() has resolved', () => {
  beforeEach(() => {
    downstream.mockReset()
    downstream.mockResolvedValue({ ok: true } as Response)
  })

  it('installs itself over the fetch that was there', () => {
    expect(globalThis.fetch).not.toBe(downstream)
    expect(globalThis.fetch.name).toBe('interceptedFetch')
  })

  it('passes a relative fetch through untouched instead of throwing', async () => {
    // The regression: initConfig()'s own OIDC discovery fetch is relative when
    // VITE_OAUTH_CONFIG is origin-relative, and an interceptor that consulted
    // getConfig() here threw "App config not initialized" — a blocked boot on
    // every self-hosted deployment shipping the relative default.
    await expect(
      globalThis.fetch('/.well-known/openid-configuration')
    ).resolves.toEqual({ ok: true })
    expect(downstream).toHaveBeenCalledWith('/.well-known/openid-configuration', undefined)
  })

  it('passes an absolute fetch through untouched, as always', async () => {
    await globalThis.fetch('https://issuer.example.com/.well-known/openid-configuration')
    expect(downstream).toHaveBeenCalledWith(
      'https://issuer.example.com/.well-known/openid-configuration',
      undefined
    )
  })
})
