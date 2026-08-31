import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from '@/hooks/useAuth'
import { hideAppLoader } from '@/lib/appLoader'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/lib/appLoader', () => ({
  hideAppLoader: vi.fn(),
}))

/** Complete auth context with every field the component reads. */
function createMockAuth(
  overrides: Partial<ReturnType<typeof useAuth>> = {}
): ReturnType<typeof useAuth> {
  return {
    token: '',
    tokenData: undefined,
    idToken: undefined,
    idTokenData: undefined,
    logIn: vi.fn(),
    login: vi.fn(),
    logOut: vi.fn(),
    error: null,
    loginInProgress: false,
    userInfo: null,
    userInfoLoading: false,
    userInfoError: null,
    rpcUserInfo: null,
    rpcUserInfoLoading: false,
    rpcUserInfoError: null,
    isAuthReady: false,
    ...overrides,
  }
}

function renderProtected() {
  return render(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>
  )
}

/**
 * ProtectedRoute renders NOTHING in every non-terminal state — the static
 * #app-loader overlay from index.html is already covering the screen, so an
 * in-component spinner would be a second, competing one. These tests therefore
 * assert "renders nothing + the right overlay decision", not message text.
 */
describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing while login is in progress, letting the boot overlay stand', () => {
    vi.mocked(useAuth).mockReturnValue(
      createMockAuth({ token: '', loginInProgress: true, isAuthReady: false })
    )

    const { container } = renderProtected()

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('NEVER calls logIn itself — _app.tsx beforeLoad owns the redirect', () => {
    // Regression guard for a real double-redirect bug: the auth library
    // transiently clears loginInProgress before setting the token, so a logIn()
    // here saw !token && !loginInProgress and fired a SECOND OAuth redirect.
    const logIn = vi.fn()
    const login = vi.fn()
    vi.mocked(useAuth).mockReturnValue(
      createMockAuth({ token: '', logIn, login, loginInProgress: false })
    )

    renderProtected()

    expect(logIn).not.toHaveBeenCalled()
    expect(login).not.toHaveBeenCalled()
  })

  it('hides the boot overlay when there is no token, so the app cannot hang', () => {
    // The hang invariant: a terminal state that leaves the overlay up is an
    // infinite spinner with no way to say what went wrong.
    vi.mocked(useAuth).mockReturnValue(
      createMockAuth({ token: '', loginInProgress: false })
    )

    const { container } = renderProtected()

    expect(container).toBeEmptyDOMElement()
    expect(hideAppLoader).toHaveBeenCalled()
  })

  it('renders nothing and KEEPS the overlay while user info is still loading', () => {
    // Still making progress — this is the one non-terminal state, so the
    // overlay must stay up rather than flashing an empty page.
    vi.mocked(useAuth).mockReturnValue(
      createMockAuth({ token: 'test-token', isAuthReady: false, userInfoLoading: true })
    )

    const { container } = renderProtected()

    expect(container).toBeEmptyDOMElement()
    expect(hideAppLoader).not.toHaveBeenCalled()
  })

  it('renders children and hides the overlay once auth is ready', () => {
    vi.mocked(useAuth).mockReturnValue(
      createMockAuth({ token: 'test-token', isAuthReady: true })
    )

    renderProtected()

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
    expect(hideAppLoader).toHaveBeenCalled()
  })

  it('shows children only after isAuthReady flips true', () => {
    vi.mocked(useAuth).mockReturnValue(
      createMockAuth({ token: 'test-token', isAuthReady: false })
    )

    const { container, rerender } = renderProtected()

    expect(container).toBeEmptyDOMElement()

    vi.mocked(useAuth).mockReturnValue(
      createMockAuth({ token: 'test-token', isAuthReady: true })
    )
    rerender(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('surfaces a userinfo failure instead of rendering children', () => {
    vi.mocked(useAuth).mockReturnValue(
      createMockAuth({
        token: 'test-token',
        isAuthReady: true,
        userInfoError: new Error('userinfo exploded'),
      })
    )

    renderProtected()

    expect(
      screen.getByText('Failed to fetch user information from OAuth provider')
    ).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(hideAppLoader).toHaveBeenCalled()
  })
})
