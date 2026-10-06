import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { ModuleSwitcher } from './ModuleSwitcher'
import { SidebarProvider } from '@/components/ui/sidebar'
import { bootApp, renderInApp } from '@/test/appHarness'

/**
 * The module switcher against the tenant's real modules.
 *
 * WHAT CHANGED AND WHY. The file mocked `@tanstack/react-router`,
 * `@/hooks/useTable` and `@/hooks/useModuleNavigate` — the last two purely to
 * keep the component out of the auth context — and then fed the switcher rows it
 * had written itself. That could not fail on a query the server rejects, a
 * column that has been renamed, or an ordering that has changed, and it checked
 * the display-name rule through the component instead of directly.
 *
 * The rule now has its own test (`contexts/getModuleDisplay.test.ts`) and this
 * file covers the wiring: the real query (`order=module_name.asc`), the real
 * mapping, and the real icon and color fallbacks.
 *
 * IT READS THE FIXTURE TENANT. The assertions below name what the `tests` tenant
 * actually contains. By name order it opens with `Equipment Maintenance` (its own
 * logo color), and the menu lists `Northwind` (description "Northwind Sample
 * Database", no logo color) and `_core` (description "Administration"). Between
 * them they exercise both display rules and both color branches. If the tenant's
 * demo data is edited, this fails loudly and gets updated — which is the point of
 * testing against data that exists rather than data invented to make an
 * assertion pass. (It was updated once already: `Equipment Maintenance` and
 * `Fuhrpark` were added and moved `Northwind` off the first position.)
 */

function renderSwitcher() {
  return renderInApp(
    <SidebarProvider>
      <ModuleSwitcher />
    </SidebarProvider>,
  )
}

const NETWORK = { timeout: 20000 }

describe('ModuleSwitcher', () => {
  beforeEach(async () => {
    await bootApp()
  })

  // The trigger shows the active module, which starts as the first by name.
  const FIRST = 'Equipment Maintenance'

  async function openMenu() {
    const user = userEvent.setup()
    renderSwitcher()
    const trigger = await waitFor(() => screen.getByRole('button', { name: new RegExp(FIRST) }), NETWORK)
    await user.click(trigger)
    return screen.findByRole('menu')
  }

  it('shows the first module by name order, under the name the display rule gives it', async () => {
    renderSwitcher()

    // Its description does not begin with its name, so the name stays the
    // visible line.
    await waitFor(
      () => expect(screen.getByRole('button', { name: new RegExp(FIRST) })).toBeInTheDocument(),
      NETWORK,
    )
  })

  it('renders the icon named by icon_name, not an <img>', async () => {
    const { container } = renderSwitcher()

    // The logo is a NamedIcon looked up by name — there has been no image logo
    // (and so no alt text) since the switcher started fetching its own modules.
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull(), NETWORK)
    expect(container.querySelector('img')).toBeNull()
  })

  it('paints the active module with its own logo color', async () => {
    const { container } = renderSwitcher()

    await waitFor(() => screen.getByRole('button', { name: new RegExp(FIRST) }), NETWORK)
    const tile = container.querySelector('[style*="background-color"]')
    expect(tile).toHaveStyle({ backgroundColor: '#520e17' })
  })

  it('lists the other modules, each under its display name and logo color', async () => {
    const menu = await openMenu()
    const tileOf = (text: string) =>
      within(menu).getByText(text).parentElement?.querySelector('[style*="background-color"]') ?? null

    // `Northwind`'s description begins with its name, so the description is
    // promoted to the single visible line; its logo_color is empty in the
    // tenant, which is the fallback path.
    expect(tileOf('Northwind Sample Database')).toHaveStyle({ backgroundColor: '#0000FF' })
    // `_core` is an internal module: the underscore rule shows its description.
    expect(tileOf('Administration')).toHaveStyle({ backgroundColor: '#029948' })
  })
})
