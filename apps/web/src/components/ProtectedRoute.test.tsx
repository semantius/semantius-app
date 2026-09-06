import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ProtectedRoute } from './ProtectedRoute'
import { AppHarness, bootApp, bootAppSignedOut, bootAppWithFailingUserinfo } from '@/test/appHarness'
import { installBootOverlay, removeBootOverlay } from '@/test/bootOverlay'

/**
 * `ProtectedRoute` with the real auth provider and the real boot overlay.
 *
 * WHAT CHANGED AND WHY. The file used to mock `@/hooks/useAuth` and
 * `@/lib/appLoader`, hand-write an eighteen-field auth context, and assert that
 * the component read the fields the test had just set. Both halves of what it
 * claimed to cover were out of reach: whether those field combinations ever
 * occur (the provider decides, and it was replaced), and whether
 * `hideAppLoader()` takes the overlay down (the real one was replaced by
 * `vi.fn()`, so a call was counted and nothing was hidden).
 *
 * Now the states are produced rather than described — sign in, sign out, break
 * the provider's userinfo endpoint — and the overlay is `index.html`'s own,
 * fetched at run time (`test/bootOverlay.ts`), so "hides the overlay" means the
 * element is really gone.
 *
 * ON THE HANG INVARIANT. `hideAppLoader()` is not synchronous: it drops
 * pointer-events and opacity immediately and sets `hidden` on `transitionend`,
 * with a 300ms fallback. So every terminal-state assertion below waits for
 * `hidden` rather than reading it straight after render.
 */

/** A budget for an assertion that is waiting on a real request, not on React. */
const NETWORK = { timeout: 20000 }

/** The overlay is up when the app boots, and only app code takes it down. */
function overlayIsUp(): boolean {
  const el = document.getElementById('app-loader')
  return !!el && !el.hidden
}

describe('ProtectedRoute', () => {
  beforeEach(async () => {
    await installBootOverlay()
  })

  afterEach(() => {
    removeBootOverlay()
  })

  it('renders children and takes the overlay down once auth is ready', async () => {
    await bootApp()

    render(
      <AppHarness>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </AppHarness>,
    )

    // Nothing renders and the overlay stands while the provider is still
    // fetching userinfo — the one non-terminal state, and the reason the
    // component returns null instead of a second spinner.
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(overlayIsUp()).toBe(true)

    // The provider's userinfo and rpc/get_userinfo are real round trips to the
    // tenant; a second is not always enough for both.
    await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument(), NETWORK)
    await waitFor(() => expect(document.getElementById('app-loader')?.hidden).toBe(true))
  })

  it('renders nothing when there is no session, and still takes the overlay down', async () => {
    await bootAppSignedOut()

    const { container } = render(
      <AppHarness>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </AppHarness>,
    )

    expect(container).toBeEmptyDOMElement()
    // The hang invariant: a terminal state that leaves the overlay up is an
    // infinite spinner with no way to say what went wrong.
    await waitFor(() => expect(document.getElementById('app-loader')?.hidden).toBe(true))
  })

  it('never starts a login of its own — _app.tsx beforeLoad owns the redirect', async () => {
    // Regression guard for a real double-redirect bug: the auth library
    // transiently clears loginInProgress before setting the token, so a logIn()
    // here saw !token && !loginInProgress and fired a SECOND OAuth redirect.
    //
    // Nothing is stubbed to detect it. `logIn()` navigates the page, so the test
    // asserts the page did not go anywhere — which is also what would happen to
    // a user: the identity provider, not this component's own state.
    await bootAppSignedOut()
    const before = window.location.href

    render(
      <AppHarness>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </AppHarness>,
    )

    await waitFor(() => expect(document.getElementById('app-loader')?.hidden).toBe(true))
    expect(window.location.href).toBe(before)
  })

  it('shows the provider’s failure instead of the app, and does not hang', async () => {
    await bootAppWithFailingUserinfo()

    render(
      <AppHarness>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </AppHarness>,
    )

    // A real 404 from a real host, surfaced by the real ApiErrorDisplay.
    await waitFor(
      () =>
        expect(
          screen.getByText('Failed to fetch user information from OAuth provider'),
        ).toBeInTheDocument(),
      NETWORK,
    )
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    await waitFor(() => expect(document.getElementById('app-loader')?.hidden).toBe(true))
  })
})
