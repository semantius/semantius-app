import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { bootApp, renderInApp } from '@/test/appHarness'
import { db, deleteVitestModules, moduleFixture } from '@/test/moduleFixture'
import { chooseRowMenuItem, findRow } from '@/test/menu'
import { testToken } from '@/test/session'
import { disableCollector } from '@/i18n/missing'
import { callRpc } from '@/lib/apiClient'
import type { EntityMetadata } from '@/types/metadata'
import { EntityView } from './EntityView'

/**
 * The generic entity page's delete path, with no customization.
 *
 * Its counterpart is `admin/Modules.test.tsx`, which swaps the dialog through
 * `renderDeleteConfirmation`. This one pins that nothing changed for every
 * other table: Delete in a row's menu still opens the generic
 * ConfirmDeleteDialog, Cancel deletes nothing and gives focus back to the row's
 * menu button. The `modules` table is used only because its rows are the
 * repo's cleanup-safe fixture (`src/test/moduleFixture.ts`).
 */

describe('EntityView — the generic delete confirmation', () => {
  let fixture: ReturnType<typeof moduleFixture>
  let metadata: EntityMetadata

  beforeEach(async () => {
    await bootApp()
    // The fixture's name and description must not reach the language index.
    disableCollector()
    fixture = moduleFixture('EntityView.test.tsx')
    const res = await db('/modules', { method: 'POST', body: JSON.stringify(fixture) })
    expect(res.ok).toBe(true)
    metadata = await callRpc<EntityMetadata>('get_schema', { p_table_name: 'modules' }, testToken())
  })

  afterEach(async () => {
    // Unconditional, so a test that threw before its own cleanup still gets one.
    await deleteVitestModules()
  })

  it('opens the generic dialog, and Cancel deletes nothing', async () => {
    const ui = userEvent.setup()
    renderInApp(<EntityView moduleId="admin" table_name="modules" recordId="" metadata={metadata} />)
    // Delete is gated on the same permission as "Add Module"; see Modules.test.tsx.
    await screen.findByRole('button', { name: 'Add Module' })

    await chooseRowMenuItem(ui, fixture.module_name, 'Delete')

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Module' })
    // <strong> splits the sentence across text nodes, so the whole of it is
    // asserted on the dialog rather than looked up with findByText.
    expect(dialog).toHaveTextContent(
      `Are you sure you want to delete ${fixture.module_name}? This action cannot be undone.`,
    )
    expect(within(dialog).queryByLabelText('Module slug')).not.toBeInTheDocument()

    await ui.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    const trigger = within(await findRow(fixture.module_name)).getByRole('button', { name: 'Open menu' })
    await waitFor(() => expect(trigger).toHaveFocus())
    const rows = (await (await db(`/modules?module_slug=eq.${fixture.module_slug}`)).json()) as unknown[]
    expect(rows).toHaveLength(1)
  })

  it('right-aligns the numeric Id column in the real grid', async () => {
    renderInApp(<EntityView moduleId="admin" table_name="modules" recordId="" metadata={metadata} />)
    await screen.findByRole('button', { name: 'Add Module' })
    await findRow(fixture.module_name)

    const title = await screen.findByRole('button', { name: /^id$/i })
    const idHeader = title.closest('th')
    expect(idHeader).toBeTruthy()
    expect(getComputedStyle(idHeader!).textAlign).toBe('right')
    expect(getComputedStyle(title).textAlign).toBe('right')
    expect(idHeader!.getBoundingClientRect().width).toBeLessThanOrEqual(160)
  })
})

/**
 * Where a record opens. `modules` has no children and 30 fields, so in `auto`
 * it opens in the sidebar, wide on this project's 1280px viewport; `roles` has
 * children, so in `auto` it opens on the standalone page. Every entity on the
 * test tenant is `auto` — the explicit `sidebar` case sets the one field the
 * component reads on the real schema.
 */
describe('EntityView — edit_mode', () => {
  let fixture: ReturnType<typeof moduleFixture>
  let modules: EntityMetadata

  beforeEach(async () => {
    await bootApp()
    disableCollector()
    fixture = moduleFixture('EntityView.test.tsx')
    const res = await db('/modules', { method: 'POST', body: JSON.stringify(fixture) })
    expect(res.ok).toBe(true)
    modules = await callRpc<EntityMetadata>('get_schema', { p_table_name: 'modules' }, testToken())
  })

  afterEach(async () => {
    await deleteVitestModules()
  })

  async function openFixtureRecord(metadata: EntityMetadata) {
    const ui = userEvent.setup()
    renderInApp(
      <EntityView moduleId="admin" table_name="modules" recordId="" metadata={metadata} />,
      { initialEntries: ['/admin/modules'], anyPath: true },
    )
    const link = within(await findRow(fixture.module_name)).getByRole('link', { name: fixture.module_name })
    expect(link.getAttribute('href')).toMatch(/^\/admin\/modules\/[^/]+$/)
    await ui.click(link)
    const sheet = await screen.findByRole('dialog')
    // Measured once the Sheet has finished opening, never polled: a polled
    // `> 540` matched some frame of the opening and passed against the 540px
    // sidebar.
    await waitFor(() => {
      expect(sheet).toHaveAttribute('data-side', 'right')
      expect(sheet).toHaveAttribute('data-open')
      expect(sheet).not.toHaveAttribute('data-starting-style')
    })
    return sheet.getBoundingClientRect().width
  }

  it('auto without children opens the wide sidebar when the form has many fields', async () => {
    expect(modules.table?.edit_mode || 'auto').toBe('auto')
    expect(modules.children ?? []).toHaveLength(0)
    expect(Object.keys(modules.properties ?? {}).length).toBeGreaterThan(10)

    const width = await openFixtureRecord(modules)
    expect(width).toBe(900)
  })

  it('sidebar follows the same wide/narrow rule as auto', async () => {
    const width = await openFixtureRecord({ ...modules, table: { ...modules.table!, edit_mode: 'sidebar' } })
    expect(width).toBe(900)
  })

  it('auto with children opens the record on the standalone page', async () => {
    const roles = await callRpc<EntityMetadata>('get_schema', { p_table_name: 'roles' }, testToken())
    expect(roles.table?.edit_mode || 'auto').toBe('auto')
    expect(roles.children?.length).toBeGreaterThan(0)

    const ui = userEvent.setup()
    const { router } = renderInApp(
      <EntityView moduleId="admin" table_name="roles" recordId="" metadata={roles} />,
      { initialEntries: ['/admin/roles'], anyPath: true },
    )
    const link = await waitFor(() => {
      const found = screen
        .getAllByRole('link')
        .find((a) => /^\/admin\/roles\/[^/]+\/view$/.test(a.getAttribute('href') ?? ''))
      expect(found).toBeTruthy()
      return found!
    })
    await ui.click(link)

    await waitFor(() => expect(router.history.location.pathname).toMatch(/^\/admin\/roles\/[^/]+\/view$/))
    // The page, not an overlay: the record's child buttons are on it and no dialog opened.
    await screen.findByRole('button', { name: `${roles.children![0].plural_label_parent || roles.children![0].plural_label}...` })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
