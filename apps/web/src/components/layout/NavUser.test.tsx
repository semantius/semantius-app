import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { NavUser } from './NavUser'
import { SidebarProvider } from '@/components/ui/sidebar'
import { bootApp, renderInApp } from '@/test/appHarness'
import type { UserMenuEntry } from '@/lib/userMenu'

/**
 * The configuration-driven account menu, configured the way a deployment
 * configures it and rendered by the app's own router.
 *
 * WHAT CHANGED AND WHY. The file mocked four modules: `@tanstack/react-router`
 * (a fake `Link` and a `history.push` spy), `@/hooks/useAuth`, `@/hooks/useTable`
 * and `@/lib/config` — the last one supplying the very menu under test. So the
 * thing being asserted was that `NavUser` renders a list handed to it by the
 * test, through a router written by the test.
 *
 * None of that was necessary. The menu is `VITE_UI_CUSTOMIZER`, a real runtime
 * variable that `initConfig()` parses (`lib/userMenu.ts`) — so the test sets the
 * variable and the real resolution runs. The permissions come from the tenant's
 * own `rpc/get_userinfo` for the signed-in identity. The router is a real one
 * whose real history says where a click went.
 *
 * PERMISSIONS ARE REAL, SO THE GATES ARE TOO. The test identity holds `admin`
 * and not `no-such-permission`; both entries below are gated on a permission
 * that genuinely is or is not in `rpcUserInfo.permissions`.
 *
 * Nothing here replaces `window.location`, `window.open` or `matchMedia`, and
 * nothing disables userEvent's pointer-events check. The three menu targets are
 * expressed in the DOM:
 *
 *   target: newtab   -> <a href target="_blank" rel="noopener noreferrer">
 *   target: redirect -> <a href>
 *   in-app           -> a menu item that calls router.history.push
 *
 * The first two are asserted by reading attributes off a link, and must NOT be
 * clicked: following a link is the browser's job, and a real browser would
 * navigate the test frame away.
 */

const HELD = 'admin'
const NOT_HELD = 'no-such-permission'

const MENU: UserMenuEntry[] = [
  { title: 'Settings', url: '/settings?orgid=acme' },
  { title: 'Account', url: '/idp/account', target: 'redirect' },
  { title: 'Docs', url: '/docs', target: 'newtab' },
  { title: 'Platform', url: 'https://app.semantius.com/settings/organization', permission: HELD },
  { title: 'Hidden', url: '/hidden', permission: NOT_HELD },
]

const USER = { name: 'Wei Chen', email: 'admin@test.com', avatar: '' }

/** Open the avatar popover; returns the click helper and the real router. */
async function openMenu() {
  const ui = userEvent.setup()
  const { router } = renderInApp(
    <SidebarProvider>
      <NavUser user={USER} />
    </SidebarProvider>,
  )
  // RouterProvider mounts its matches asynchronously, so the trigger is not
  // there on the first tick.
  const trigger = await waitFor(() => screen.getByRole('button', { name: /Wei Chen/i }))
  await ui.click(trigger)
  // The popup mounts in a portal a tick after the click.
  await waitFor(() => expect(screen.getByText('Log out')).toBeInTheDocument())
  return { ui, router }
}

describe('NavUser — configuration-driven menu', () => {
  beforeEach(async () => {
    // The real configuration channel: VITE_UI_CUSTOMIZER is a JSON string that
    // initConfig() deserializes and resolves ({orgid} substitution, target
    // resolution) before anything renders.
    await bootApp({
      VITE_BACKEND_TYPE: 'custom',
      VITE_UI_CUSTOMIZER: JSON.stringify({ user: { menu: MENU } }),
    })
  })

  it('hides an entry gated on a permission this user does not hold', async () => {
    await openMenu()

    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })

  it('shows an entry gated on a permission this user does hold', async () => {
    await openMenu()

    // rpcUserInfo is null until /rpc/get_userinfo resolves, so gated entries
    // appear only once the real answer is in — the same behavior as module
    // gating, and the reason this one waits.
    await waitFor(() => expect(screen.getByText('Platform')).toBeInTheDocument(), {
      timeout: 20000,
    })
  })

  it('pushes the exact configured URL for an in-app entry', async () => {
    const { ui, router } = await openMenu()

    await ui.click(screen.getByText('Settings'))

    // Read off the router's real history. Verbatim — the query string must
    // survive, un-re-encoded.
    expect(router.history.location.href).toBe('/settings?orgid=acme')
  })

  it('renders target: redirect as a link, so the browser leaves the SPA', async () => {
    const { router } = await openMenu()

    // /idp is proxied to another server: a router push would match the SPA's
    // catch-all module route and 404 until the user hit refresh. A link is a
    // document navigation by construction — there is no push to suppress.
    const account = screen.getByRole('menuitem', { name: 'Account' })
    expect(account).toHaveAttribute('href', '/idp/account')
    expect(account.tagName).toBe('A')
    expect(account).not.toHaveAttribute('target')
    expect(router.history.location.href).toBe('/')
  })

  it('renders target: newtab as a link that cannot reach back through window.opener', async () => {
    await openMenu()

    const docs = screen.getByRole('menuitem', { name: 'Docs' })
    expect(docs).toHaveAttribute('href', '/docs')
    expect(docs).toHaveAttribute('target', '_blank')
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer')
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
