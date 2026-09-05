import { describe, expect, it } from 'vitest'
import { secureContextError } from './secureContext'

/**
 * Runs in `node`, with no browser and nothing faking one. The rule this covers
 * used to be tested by stubbing `globalThis.isSecureContext` and `globalThis
 * .crypto` — i.e. by writing down the answer and checking the code read it back.
 * As a function of its three inputs there is nothing left to stub.
 *
 * What this does NOT cover, and cannot: that the browser really does withhold
 * `crypto.subtle` on a plain-HTTP LAN origin. That is a browser guarantee, and
 * checking it needs a real non-secure origin — a `vite preview` bound to the
 * machine's LAN address, driven by Playwright.
 */
describe('secureContextError', () => {
  const origin = 'http://192.168.1.24:3000'

  it('passes a secure context that has subtle crypto', () => {
    expect(
      secureContextError({ origin: 'https://app.example.com', isSecureContext: true, hasSubtleCrypto: true }),
    ).toBeNull()
  })

  it('names the origin when the context is not secure', () => {
    const err = secureContextError({ origin, isSecureContext: false, hasSubtleCrypto: false })
    expect(err).toContain(origin)
    expect(err).toContain('crypto.subtle')
  })

  it('fails a secure context that still has no subtle crypto', () => {
    // Tests the CAPABILITY, not the scheme: a context can report itself secure
    // and still lack the API, and the login would then fail after the app had
    // already committed to redirecting.
    expect(
      secureContextError({ origin, isSecureContext: true, hasSubtleCrypto: false }),
    ).toContain('crypto.subtle')
  })

  it('fails a non-secure context even where subtle crypto is somehow present', () => {
    expect(
      secureContextError({ origin, isSecureContext: false, hasSubtleCrypto: true }),
    ).toContain('crypto.subtle')
  })

  it('tells the reader what to do about it', () => {
    const err = secureContextError({ origin, isSecureContext: false, hasSubtleCrypto: false })
    expect(err).toContain('HTTPS')
    expect(err).toContain('localhost')
  })
})
