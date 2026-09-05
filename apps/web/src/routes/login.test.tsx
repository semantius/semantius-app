import { describe, it, expect, vi, beforeEach } from 'vitest'
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

const LOGIN_START_ERROR =
  "The context/environment is not secure, and does not support the 'crypto.subtle' module."

/**
 * Stand-in for react-oauth2-code-pkce's context. logIn() there is fire-and-
 * forget — `redirectToLogin(...).catch(e => setError(e.message))` — so a failure
 * to *start* the flow never rejects to the caller and only ever appears as
 * `error`. This mock reproduces exactly that contract.
 *
 * `failing` used to be expressed by stubbing `globalThis.crypto` so the mock's
 * own `crypto.subtle` guard tripped. Nothing in the app ever read that stub —
 * only this mock did — so it was a browser primitive replaced to communicate a
 * boolean to the file that replaced it. It is now the boolean.
 */
function installAuthMock({ failing }: { failing: boolean }) {
  const logIn = vi.fn()
  vi.mocked(useAuth).mockImplementation(() => {
    const [error, setError] = useState<string | null>(null)
    const wrappedLogIn = useCallback((state?: string) => {
      logIn(state)
      if (failing) setError(LOGIN_START_ERROR)
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
// CSS transition ends, or its 300ms fallback fires. This is the "no longer in
// the way" half of that.
function appLoaderDismissing() {
  const el = document.getElementById('app-loader')!
  return el.style.pointerEvents === 'none' && el.style.opacity === '0'
}

describe('/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Vitest's tester page is an empty document, so the overlay index.html
    // ships has to be built here. See the note in lib/appLoader.test.ts for why
    // this stand-in is accepted rather than served from a copy of index.html.
    document.body.innerHTML = ''
    const overlay = document.createElement('div')
    overlay.id = 'app-loader'
    document.body.appendChild(overlay)
  })

  it('renders the failure UI and hides the overlay when logIn() cannot start', async () => {
    // logIn() failed to even start the redirect — the library caught its own
    // rejection and the message surfaced only as useAuth().error.
    installAuthMock({ failing: true })

    render(<LoginComponent />)

    expect(await screen.findByText(LOGIN_START_ERROR)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    // Without this the card renders behind an opaque overlay — a hang, not an error.
    expect(appLoaderDismissing()).toBe(true)
    await waitFor(() => expect(appLoaderHidden()).toBe(true))
  })

  it('retries the login when Try Again is clicked', async () => {
    const logIn = installAuthMock({ failing: true })

    render(<LoginComponent />)
    await screen.findByText(LOGIN_START_ERROR)
    expect(logIn).toHaveBeenCalledTimes(1)

    // The strict-mode ref guard must not swallow a manual retry.
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(logIn).toHaveBeenCalledTimes(2)
  })

  it('renders nothing and leaves the overlay up while the redirect is in flight', () => {
    const logIn = installAuthMock({ failing: false })

    const { container } = render(<LoginComponent />)

    expect(logIn).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
    expect(appLoaderHidden()).toBe(false)
    expect(appLoaderDismissing()).toBe(false)
  })
})
