import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { ModuleSwitcher } from './ModuleSwitcher'
import { SidebarProvider } from '@/components/ui/sidebar'

// Mock TanStack Router hooks
vi.mock('@tanstack/react-router', () => ({
  useParams: vi.fn(() => ({
    moduleId: undefined,
    table_name: undefined,
    key: undefined,
  })),
  useNavigate: vi.fn(() => vi.fn()),
}))

// ModuleSwitcher takes NO modules prop — it fetches its own rows through
// useModules -> useTable -> useAuth. Stubbing useTable is what keeps the test
// out of the auth context (rendering it bare threw "useAuth must be used
// within AuthProviderWrapper").
const mockRows = vi.hoisted(() => ({ current: [] as Record<string, unknown>[] }))

vi.mock('@/hooks/useTable', () => ({
  useTable: () => ({ data: mockRows.current, isLoading: false, error: null }),
}))

// useModuleNavigate reads useAuth too, so it needs stubbing for the same reason.
vi.mock('@/hooks/useModuleNavigate', () => ({
  useModuleNavigate: () => vi.fn(),
}))

describe('ModuleSwitcher', () => {
  beforeAll(() => {
    // Mock ResizeObserver
    global.ResizeObserver = class ResizeObserver {
      observe() { }
      unobserve() { }
      disconnect() { }
    }

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  /** A row as PostgREST returns it, which is what useModules maps. */
  function moduleRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      module_name: 'Test Module 1',
      module_slug: 'test-module-1',
      description: '',
      icon_name: 'database',
      logo_color: '#FF0000',
      ...overrides,
    }
  }

  function renderSwitcher(rows: Record<string, unknown>[]) {
    mockRows.current = rows
    return render(
      <SidebarProvider>
        <ModuleSwitcher />
      </SidebarProvider>
    )
  }

  it('renders the first fetched module as the active one', () => {
    renderSwitcher([
      moduleRow(),
      moduleRow({ id: 2, module_name: 'Test Module 2', module_slug: 'test-module-2' }),
    ])

    expect(screen.getByText('Test Module 1')).toBeInTheDocument()
  })

  it('renders the icon named by icon_name, not an <img>', () => {
    // The logo is a NamedIcon looked up by name — there has been no image
    // logo (and so no alt text) since the switcher started fetching its own
    // modules.
    const { container } = renderSwitcher([moduleRow({ icon_name: 'database' })])

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('paints the logo tile with logo_color', () => {
    const { container } = renderSwitcher([moduleRow({ logo_color: '#FF0000' })])

    const tile = container.querySelector('[style*="background-color"]')
    expect(tile).toHaveStyle({ backgroundColor: '#FF0000' })
  })

  it('falls back to the form icon and the default blue when the row omits them', () => {
    const { container } = renderSwitcher([
      moduleRow({ icon_name: null, logo_color: null }),
    ])

    const tile = container.querySelector('[style*="background-color"]')
    expect(tile).toHaveStyle({ backgroundColor: '#0000FF' })
  })

  it('promotes description to the display name when it starts with the module name', () => {
    renderSwitcher([
      moduleRow({ module_name: 'CRM', description: 'CRM — Customer Records' }),
    ])

    expect(screen.getByText('CRM — Customer Records')).toBeInTheDocument()
  })
})
