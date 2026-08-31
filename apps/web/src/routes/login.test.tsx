import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCallback, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

// The route module is exercised through `Route.options.component` rather than a
// real router: the only router surface LoginComponent touches is useSearch().
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  redirect: (opts: unknown) => opts,
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }))

import { Route } from './login'

const LoginComponent = (Route as any).options.component as () => React.ReactNode

const CRYPTO_SUBTLE_ERROR =
  "The context/environment is not secure, and does not support the 'crypto.subtle' module."

const realCrypto = globalThis.crypto

/**
 * Stand-in for react-oauth2-code-pkce's context. logIn() there is fire-and-
 * forget — `redirectToLogin(...).catch(e => setError(e.message))` — so a failure
 * to *start* the flow never rejects to the caller and only ever appears as
 * `error`. This mock reproduces exactly that contract, including the real
 * library's crypto.subtle guard.
 */
function installAuthMock() {
  const logIn = vi.fn()
  vi.mocked(useAuth).mockImplementation(() => {
    const [error, setError] = useState<string | null>(null)
    const wrappedLogIn = useCallback((state?: string) => {
      logIn(state)
      if (!globalThis.crypto?.subtle) setError(CRYPTO_SUBTLE_ERROR)
    }, [])
    return { error, logIn: wrappedLogIn } as any
  })
  return logIn
}

function appLoaderHidden() {
  return document.getElementById('app-loader')!.hasAttribute('hidden')
}

// hideAppLoader() fades the overlay out rather than removing it outright: it
// drops pointer-events and opacity on the spot and only sets [hidden] when the
// CSS transition ends (or its fallback timer fires — jsdom emits no
// transitionend). This is the "no longer in the way" half of that.
function appLoaderDismissing() {
  const el = document.getElementById('app-loader')!
  return el.style.pointerEvents === 'none' && el.style.opacity === '0'
}

describe('/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mirrors the static overlay in index.html that only app code can dismiss.
    document.body.innerHTML = '<div id="app-loader"></div>'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the failure UI and hides the overlay when logIn() cannot start', async () => {
    // A non-secure context (plain HTTP on a LAN IP) — the browser withholds
    // crypto.subtle, so the PKCE challenge can never be built.
    vi.stubGlobal('crypto', { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) })
    installAuthMock()

    render(<LoginComponent />)

    expect(await screen.findByText(CRYPTO_SUBTLE_ERROR)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    // Without this the card renders behind an opaque overlay — a hang, not an error.
    expect(appLoaderDismissing()).toBe(true)
    await waitFor(() => expect(appLoaderHidden()).toBe(true))
  })

  it('retries the login when Try Again is clicked', async () => {
    vi.stubGlobal('crypto', { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) })
    const logIn = installAuthMock()

    render(<LoginComponent />)
    await screen.findByText(CRYPTO_SUBTLE_ERROR)
    expect(logIn).toHaveBeenCalledTimes(1)

    // The strict-mode ref guard must not swallow a manual retry.
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(logIn).toHaveBeenCalledTimes(2)
  })

  it('renders nothing and leaves the overlay up while the redirect is in flight', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
      subtle: {},
    })
    const logIn = installAuthMock()

    const { container } = render(<LoginComponent />)

    expect(logIn).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
    expect(appLoaderHidden()).toBe(false)
    expect(appLoaderDismissing()).toBe(false)
  })
})
