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
 * IT READS THE FIXTURE TENANT, BUT ONLY WHAT IS STABLE. The tenant's demo
 * modules come and go, and pinning which one sorts first broke this file every
 * time one was added. So the active module is checked against the menu (the
 * trigger shows whatever the menu lists first), never by name. The only rows
 * named are the platform's own two — `Northwind` (description "Northwind Sample
 * Database", no logo color) and `_core` (description "Administration") — which
 * between them exercise both display rules and both color branches.
 */

function renderSwitcher() {
  return renderInApp(
    <SidebarProvider>
      <ModuleSwitcher />
    </SidebarProvider>,
  )
}

const NETWORK = { timeout: 15000 }

// The logo tile is the one element carrying an inline background color.
const tileIn = (el: Element) => el.querySelector<HTMLElement>('[style*="background-color"]')

describe('ModuleSwitcher', () => {
  beforeEach(async () => {
    await bootApp()
  })

  // The loading skeleton is a plain button; only the loaded switcher is a menu
  // trigger, so waiting for one is waiting for the modules.
  async function findTrigger(container: HTMLElement) {
    return waitFor(() => {
      const trigger = container.querySelector<HTMLElement>('[aria-haspopup="menu"]')
      expect(trigger).not.toBeNull()
      return trigger!
    }, NETWORK)
  }

  async function openMenu() {
    const user = userEvent.setup()
    const { container } = renderSwitcher()
    const trigger = await findTrigger(container)
    await user.click(trigger)
    const menu = await screen.findByRole('menu')
    // The first item is "Quick navigation"; the modules follow in query order.
    const modules = within(menu).getAllByRole('menuitem').slice(1)
    return { container, trigger, menu, modules }
  }

  it('makes the first listed module the active one, with its name and color', async () => {
    const { trigger, modules } = await openMenu()

    expect(modules.length).toBeGreaterThan(0)
    expect(trigger).toHaveTextContent(modules[0].textContent!.trim())
    const color = tileIn(modules[0])!.style.backgroundColor
    expect(tileIn(trigger)).toHaveStyle({ backgroundColor: color })
  })

  it('renders the icon named by icon_name inside the logo tile, not an <img>', async () => {
    const { container } = renderSwitcher()
    const trigger = await findTrigger(container)

    // Scoped to the tile: the trigger's chevron is an <svg> too, so a bare
    // `querySelector('svg')` would pass with no logo at all. Waited for, because
    // `DynamicIcon` imports each icon lazily and renders nothing until it lands.
    await waitFor(() => expect(tileIn(trigger)?.querySelector('svg')).not.toBeNull(), NETWORK)
    expect(container.querySelector('img')).toBeNull()
  })

  it('lists the modules in name order, each under its display name and logo color', async () => {
    const { menu, modules } = await openMenu()
    const item = (text: string) => within(menu).getByText(text).closest('[role="menuitem"]')!

    // `Northwind`'s description begins with its name, so the description is
    // promoted to the single visible line; its logo_color is empty in the
    // tenant, which is the fallback path.
    expect(tileIn(item('Northwind Sample Database'))).toHaveStyle({ backgroundColor: '#0000FF' })
    // `_core` is an internal module: the underscore rule shows its description.
    expect(tileIn(item('Administration'))).toHaveStyle({ backgroundColor: '#029948' })

    // By `module_name`, `Northwind` sorts before `_core`, whatever else the
    // tenant holds around them.
    expect(modules.indexOf(item('Northwind Sample Database') as HTMLElement))
      .toBeLessThan(modules.indexOf(item('Administration') as HTMLElement))
  })
})
