import { screen, waitFor } from '@testing-library/react'
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
 * actually contains — `Northwind` (description "Northwind Sample Database", no
 * logo color) and `_core` (description "Administration"). That is deliberate:
 * they are the platform's own demo modules, and between them they exercise both
 * display rules and both color branches. If the tenant's demo data is edited,
 * this fails loudly and gets updated — which is the point of testing against
 * data that exists rather than data invented to make an assertion pass.
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

  it('shows the first module by name order, under the name the display rule gives it', async () => {
    renderSwitcher()

    // `Northwind` sorts before `_core`, and its description begins with its
    // name, so the description is promoted to the single visible line.
    await waitFor(
      () => expect(screen.getByText('Northwind Sample Database')).toBeInTheDocument(),
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

  it('falls back to the default blue when the row carries no logo color', async () => {
    const { container } = renderSwitcher()

    // Northwind's logo_color is empty in the tenant, which is the fallback path.
    await waitFor(
      () => expect(screen.getByText('Northwind Sample Database')).toBeInTheDocument(),
      NETWORK,
    )
    const tile = container.querySelector('[style*="background-color"]')
    expect(tile).toHaveStyle({ backgroundColor: '#0000FF' })
  })

  it('lists the other modules, each painted with its own logo color', async () => {
    const user = userEvent.setup()
    renderSwitcher()

    await waitFor(
      () => expect(screen.getByText('Northwind Sample Database')).toBeInTheDocument(),
      NETWORK,
    )
    await user.click(screen.getByRole('button', { name: /Northwind Sample Database/i }))

    // `_core` is an internal module: the underscore rule shows its description.
    const administration = await waitFor(() => screen.getByText('Administration'))
    const tile = administration.parentElement?.querySelector('[style*="background-color"]')
    expect(tile).toHaveStyle({ backgroundColor: '#029948' })
  })
})
