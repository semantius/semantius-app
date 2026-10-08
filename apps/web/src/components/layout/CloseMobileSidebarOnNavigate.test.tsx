import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { I18nProvider } from '@lingui/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { i18n } from '@/i18n'
import { disableCollector } from '@/i18n/missing'
import { CloseMobileSidebarOnNavigate } from './CloseMobileSidebarOnNavigate'
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

/**
 * The mobile sidebar is a modal Sheet. These tests drive a real Chromium
 * viewport (the suite's default is 1280×800) and a real router, because
 * `useIsMobile` reads matchMedia and the sheet is a Base UI dialog — neither
 * of those is meaningful under a fake viewport or a mocked router.
 *
 * The nav item does NOT call `setOpenMobile` itself. Closing has to come from
 * the pathname subscription, which is the catch-all that covers the module
 * switcher, the command palette, bookmarks, and every future destination.
 */

const DESKTOP = { width: 1280, height: 800 } as const
const PHONE = { width: 390, height: 844 } as const
const MOBILE_QUERY = 'not all and (min-width: 48rem)'

function Shell() {
  const router = useRouter()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <SidebarProvider>
      <CloseMobileSidebarOnNavigate />
      <Sidebar>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => router.history.push('/elsewhere')}>
                Customers
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header>
          <SidebarTrigger />
        </header>
        <div data-testid="path">{pathname}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function renderShell() {
  const rootRoute = createRootRoute({ component: Shell })
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null }),
    createRoute({ getParentRoute: () => rootRoute, path: '/elsewhere', component: () => null }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const result = render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  )
  return { ...result, router }
}

async function waitForMobileSheet() {
  await waitFor(() => {
    expect(window.matchMedia(MOBILE_QUERY).matches).toBe(true)
    // Base UI's Dialog.Root is a provider, not a node, so a closed Sheet is
    // invisible in the DOM. The signal that `useIsMobile` has flipped is that
    // the desktop panel (always mounted, `hidden md:block`) is gone.
    expect(document.querySelector('[data-slot="sidebar"]:not([data-mobile="true"])')).toBeNull()
  })
}

describe('mobile sidebar sheet', () => {
  beforeEach(async () => {
    disableCollector()
    await page.viewport(PHONE.width, PHONE.height)
  })

  afterEach(async () => {
    await page.viewport(DESKTOP.width, DESKTOP.height)
  })

  it('opens as a named dialog, not a full-screen panel, and reports expanded state', async () => {
    const user = userEvent.setup()
    renderShell()
    await waitForMobileSheet()

    const trigger = await screen.findByRole('button', { name: /toggle sidebar/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Sidebar' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    // The sheet enters with `data-starting-style:opacity-0`; wait for the
    // animation to finish before asserting visibility.
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Customers' })).toBeVisible()
      expect(within(dialog).getByRole('button', { name: 'Close' })).toBeVisible()
    })

    const panel = dialog.getBoundingClientRect()
    expect(panel.width).toBeLessThan(window.innerWidth)
    expect(panel.width).toBeGreaterThan(200)
  })

  it('closes the overlay when a nav item is tapped, so the destination is visible', async () => {
    const user = userEvent.setup()
    const { router } = renderShell()
    await waitForMobileSheet()

    await user.click(await screen.findByRole('button', { name: /toggle sidebar/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Sidebar' })
    await user.click(within(dialog).getByRole('button', { name: 'Customers' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(router.history.location.pathname).toBe('/elsewhere')
    expect(screen.getByTestId('path')).toHaveTextContent('/elsewhere')
    expect(screen.getByRole('button', { name: /toggle sidebar/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('closes from the sheet close button without navigating', async () => {
    const user = userEvent.setup()
    const { router } = renderShell()
    await waitForMobileSheet()

    await user.click(await screen.findByRole('button', { name: /toggle sidebar/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Sidebar' })
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(router.history.location.pathname).toBe('/')
  })
})

describe('desktop sidebar', () => {
  beforeEach(async () => {
    disableCollector()
    await page.viewport(DESKTOP.width, DESKTOP.height)
  })

  it('stays on screen after a nav click — it is not a modal overlay', async () => {
    const user = userEvent.setup()
    const { router } = renderShell()

    await waitFor(() => {
      expect(window.matchMedia(MOBILE_QUERY).matches).toBe(false)
      expect(document.querySelector('[data-slot="sheet"]')).toBeNull()
    })

    const customers = await screen.findByRole('button', { name: 'Customers' })
    expect(customers).toBeVisible()
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(customers)

    await waitFor(() => {
      expect(router.history.location.pathname).toBe('/elsewhere')
    })
    expect(screen.getByRole('button', { name: 'Customers' })).toBeVisible()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
