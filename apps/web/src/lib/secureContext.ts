/**
 * PKCE needs WebCrypto (`crypto.subtle.digest` for the S256 challenge), and
 * browsers withhold `crypto.subtle` outside a secure context — HTTPS, or the
 * `localhost` / `127.0.0.1` exemption. Reaching a plain-HTTP deployment over a
 * LAN IP (`http://192.168.x.x:3000`) therefore makes login impossible.
 *
 * The RULE is a pure function of three observations so it can be tested without
 * a browser and without faking one. (Its MESSAGE is now translated, so the
 * function reads the active catalog — the rule it encodes still does not read
 * anything else, and both Vitest projects activate `en-US` before the first
 * test.) Deciding it from the OBSERVED capability rather than from scheme +
 * hostname is what keeps it correct behind a reverse proxy, in any deployment
 * shape, and under `vite dev`: if the capability is there, the flow can run.
 *
 * Recorded as a config error so boot stops at the existing screen in main.tsx
 * BEFORE a login is attempted — otherwise logIn() fails after the app has
 * committed to redirecting, which is invisible unless a route branches on
 * useAuth().error.
 */
import { translate } from '@/i18n'

export function secureContextError(input: {
  origin: string
  isSecureContext: boolean
  hasSubtleCrypto: boolean
}): string | null {
  if (input.isSecureContext && input.hasSubtleCrypto) return null
  // One message, not three concatenated fragments: the sentence has to be
  // reorderable, and `translate` rather than `t` because this runs during boot,
  // outside React, and its result is frozen into the configuration error.
  return translate(
    'This origin ({origin}) is not a secure context, so the browser withholds crypto.subtle — the WebCrypto API the PKCE login flow requires. Serve the app over HTTPS, or reach it at http://localhost.',
    { origin: input.origin },
  )
}

/** The same rule, read off the current browser. `null` where there is no browser. */
export function currentSecureContextError(): string | null {
  if (typeof window === 'undefined') return null
  return secureContextError({
    origin: window.location.origin,
    isSecureContext: window.isSecureContext,
    hasSubtleCrypto: Boolean(window.crypto?.subtle),
  })
}
