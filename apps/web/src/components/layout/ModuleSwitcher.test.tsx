import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ModuleSwitcher } from './ModuleSwitcher'
import { SidebarProvider } from '@/components/ui/sidebar'
import { bootApp, renderInApp } from '@/test/appHarness'
import { db, deleteVitestModules, moduleFixture } from '@/test/moduleFixture'

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
 * IT NAMES NO TENANT MODULE. The tenant's demo modules come and go, and pinning
 * which one sorts first broke this file every time one was added; Northwind is
 * not on every backend either. So the active module is checked against the menu
 * (the trigger shows whatever the menu lists first), and the rows the last test
 * names are two it writes itself and deletes again.
 */

const FILE = 'ModuleSwitcher.test.tsx'

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

  afterEach(async () => {
    await deleteVitestModules()
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
    // Both names start with `_`, so the underscore rule shows the description
    // (the rules themselves are getModuleDisplay.test.ts's) — made unique per
    // row, because CI runs share the tenant. One has no logo_color: the
    // fallback path. The other has its own.
    const fixture = (logo_color: string | null) => {
      const row = { ...moduleFixture(FILE), logo_color }
      return { ...row, description: `${row.description} ${row.module_slug}` }
    }
    const plain = fixture(null)
    const colored = fixture('#123456')
    const created = await db('/modules', { method: 'POST', body: JSON.stringify([plain, colored]) })
    expect(created.ok, await created.clone().text()).toBe(true)

    const { menu, modules } = await openMenu()
    const item = (text: string) => within(menu).getByText(text).closest<HTMLElement>('[role="menuitem"]')!

    expect(tileIn(item(plain.description))).toHaveStyle({ backgroundColor: '#0000FF' })
    expect(tileIn(item(colored.description))).toHaveStyle({ backgroundColor: '#123456' })

    // By `module_name`. The two differ only in hex digits after a shared
    // prefix, which every collation orders the same way.
    const [first, second] = plain.module_name < colored.module_name ? [plain, colored] : [colored, plain]
    expect(modules.indexOf(item(first.description))).toBeLessThan(modules.indexOf(item(second.description)))
  })
})
