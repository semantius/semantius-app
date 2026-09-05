import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
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
  { title: 'Account', url: '/idp/account', target: 'redirect' },
  { title: 'Docs', url: '/docs', target: 'newtab' },
  { title: 'Platform', url: 'https://app.semantius.com/settings/organization', permission: 'admin' },
]

vi.mock('@/lib/config', () => ({
  getConfig: () => ({ uiCustomizer: { user: { menu: MENU } } }),
}))

// Nothing here replaces `window.location`, `window.open` or `matchMedia`, and
// nothing disables userEvent's pointer-events check. This file runs in a real
// Chromium, where those exist — and the three menu targets a test used to
// observe by spying on them are now expressed in the DOM instead:
//
//   target: newtab   -> <a href target="_blank" rel="noopener noreferrer">
//   target: redirect -> <a href>
//   in-app           -> a menu item that calls router.history.push
//
// Which means the first two are asserted by reading attributes off a link
// rather than by clicking and hoping a spy recorded it. Following a link is the
// browser's job, not this suite's — and a test must NOT click these, because a
// real browser would then navigate the test frame away.

const user = { name: 'Wei Chen', email: 'admin@test.com', avatar: '' }

/** Open the avatar popover and return a click helper for its items. */
async function openMenu() {
  const ui = userEvent.setup()
  render(
    <SidebarProvider>
      <NavUser user={user} />
    </SidebarProvider>
  )
  const trigger = screen.getByRole('button')
  await ui.click(trigger)
  // The popup mounts in a portal a tick after the click.
  await waitFor(() => expect(screen.getByText('Log out')).toBeInTheDocument())
  return ui
}

describe('NavUser — configuration-driven menu', () => {
  beforeEach(() => {
    pushSpy.mockClear()
    mockPermissions.mockReturnValue([])
  })

  it('hides a permission-gated entry from a user without the permission', async () => {
    await openMenu()

    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.queryByText('Platform')).not.toBeInTheDocument()
  })

  it('shows a permission-gated entry to a user who holds the permission', async () => {
    mockPermissions.mockReturnValue(['admin'])

    await openMenu()

    expect(screen.getByText('Platform')).toBeInTheDocument()
  })

  it('pushes the exact configured URL for an in-app entry', async () => {
    const ui = await openMenu()

    await ui.click(screen.getByText('Settings'))

    // Verbatim — the query string must survive, un-re-encoded.
    expect(pushSpy).toHaveBeenCalledWith('/settings?orgid=acme')
  })

  it('renders target: redirect as a link, so the browser leaves the SPA', async () => {
    await openMenu()

    // /idp is proxied to another server: a router push would match the SPA's
    // catch-all module route and 404 until the user hit refresh. A link is a
    // document navigation by construction — there is no push to suppress.
    const account = screen.getByRole('menuitem', { name: 'Account' })
    expect(account).toHaveAttribute('href', '/idp/account')
    expect(account.tagName).toBe('A')
    expect(account).not.toHaveAttribute('target')
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('renders target: newtab as a link that cannot reach back through window.opener', async () => {
    await openMenu()

    const docs = screen.getByRole('menuitem', { name: 'Docs' })
    expect(docs).toHaveAttribute('href', '/docs')
    expect(docs).toHaveAttribute('target', '_blank')
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer')
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('renders an in-app entry as a menu item, not a link', async () => {
    await openMenu()

    // The counterpart to the two above: `Settings` is relative and carries no
    // target, so it must NOT become an anchor — an href would take the browser
    // out of the SPA on a route the router owns.
    expect(screen.getByRole('menuitem', { name: 'Settings' })).not.toHaveAttribute('href')
  })

  it('offers Log out as a link to /logout, below the configured entries', async () => {
    await openMenu()

    // A document load, so nothing survives the sign-out.
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveAttribute('href', '/logout')
  })
})
