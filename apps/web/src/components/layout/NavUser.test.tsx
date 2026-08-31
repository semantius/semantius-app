import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NavUser } from './NavUser'
import { SidebarProvider } from '@/components/ui/sidebar'
import type { UserMenuEntry } from '@/lib/userMenu'

const pushSpy = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children?: React.ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { push: pushSpy } }),
}))

const mockPermissions = vi.fn<() => string[]>(() => [])

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ rpcUserInfo: { permissions: mockPermissions() } }),
}))

vi.mock('@/hooks/useTable', () => ({
  useTable: () => ({ data: [] }),
}))

const MENU: UserMenuEntry[] = [
  { title: 'Settings', url: '/settings?orgid=acme' },
  { title: 'Platform', url: 'https://app.semantius.com/settings/organization', permission: 'admin' },
]

vi.mock('@/lib/config', () => ({
  getConfig: () => ({ uiCustomizer: { user: { menu: MENU } } }),
}))

const user = { name: 'Wei Chen', email: 'admin@test.com', avatar: '' }

/** Open the avatar popover and return a click helper for its items. */
async function openMenu() {
  // Base UI guards against clicks on elements jsdom reports as pointer-events:none.
  const ui = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <SidebarProvider>
      <NavUser user={user} />
    </SidebarProvider>
  )
  const trigger = screen.getByRole('button')
  await ui.click(trigger)
  // The popup mounts in a portal a tick after the click. Generous timeouts here
  // and on each `it` below: in the full-suite run this file's first render pays
  // the import cost and gets close to vitest's 5s default.
  await waitFor(() => expect(screen.getByText('Log out')).toBeInTheDocument(), { timeout: 10_000 })
  return ui
}

describe('NavUser — configuration-driven menu', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  beforeEach(() => {
    pushSpy.mockClear()
    mockPermissions.mockReturnValue([])
  })

  it('hides a permission-gated entry from a user without the permission', { timeout: 20_000 }, async () => {
    await openMenu()

    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.queryByText('Platform')).not.toBeInTheDocument()
  })

  it('shows a permission-gated entry to a user who holds the permission', { timeout: 20_000 }, async () => {
    mockPermissions.mockReturnValue(['admin'])

    await openMenu()

    expect(screen.getByText('Platform')).toBeInTheDocument()
  })

  it('pushes the exact configured URL for an in-app entry', { timeout: 20_000 }, async () => {
    const ui = await openMenu()

    await ui.click(screen.getByText('Settings'))

    // Verbatim — the query string must survive, un-re-encoded.
    expect(pushSpy).toHaveBeenCalledWith('/settings?orgid=acme')
  })

  it('still renders Log out below the configured entries', { timeout: 20_000 }, async () => {
    await openMenu()

    expect(screen.getByText('Log out')).toBeInTheDocument()
  })
})
