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
import { Modules } from './Modules'

/**
 * The `modules` override end to end: the real grid over the real tenant, a real
 * fixture module, and the two-step dialog it swaps in for the generic one.
 *
 * `ConfirmDeleteModuleDialog.test.tsx` covers the dialog's own rules; this file
 * covers what only the grid can show — that choosing Delete in a row's menu
 * reaches THIS dialog, that confirming it really deletes the row, and that
 * closing it and choosing Delete again starts over at step 1.
 */

type Fixture = ReturnType<typeof moduleFixture>

describe('Modules — the two-step delete through the grid', () => {
  let fixture: Fixture
  let metadata: EntityMetadata

  beforeEach(async () => {
    await bootApp()
    // The fixture module's name and description are model text as far as the
    // app is concerned (they arrive through get_userinfo's module list), and
    // its slug is random per run: nothing this file renders belongs in the
    // language index.
    disableCollector()
    fixture = moduleFixture('Modules.test.tsx')
    const res = await db('/modules', { method: 'POST', body: JSON.stringify(fixture) })
    expect(res.ok).toBe(true)
    metadata = await callRpc<EntityMetadata>('get_schema', { p_table_name: 'modules' }, testToken())
  })

  afterEach(async () => {
    // Unconditional, so a test that threw before its own cleanup still gets one.
    await deleteVitestModules()
  })

  async function renderGrid() {
    const ui = userEvent.setup()
    renderInApp(<Modules moduleId="admin" table_name="modules" recordId="" metadata={metadata} />)
    // The row menu's Delete is gated on the entity's edit_permission, which
    // reads get_userinfo — false until it lands. "Add Module" is gated on the
    // same permission, so once it is there the menu will offer Delete.
    await screen.findByRole('button', { name: 'Add Module' })
    return ui
  }

  it('deletes the module once its slug has been typed', async () => {
    const ui = await renderGrid()
    await chooseRowMenuItem(ui, fixture.module_name, 'Delete')

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Module' })
    expect(dialog).toHaveTextContent(`Deleting ${fixture.module_name} removes the module`)
    await ui.click(within(dialog).getByRole('button', { name: 'Delete' }))

    const input = await within(dialog).findByLabelText('Module slug')
    await waitFor(() => expect(input).toHaveFocus())
    await ui.keyboard(fixture.module_slug)
    await ui.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText(fixture.module_name)).not.toBeInTheDocument())
    const rows = (await (await db(`/modules?module_slug=eq.${fixture.module_slug}`)).json()) as unknown[]
    expect(rows).toEqual([])
  })

  it('returns focus to the row menu on Cancel, and starts over at step 1 next time', async () => {
    const ui = await renderGrid()
    await chooseRowMenuItem(ui, fixture.module_name, 'Delete')

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Module' })
    await ui.click(within(dialog).getByRole('button', { name: 'Delete' }))
    const input = await within(dialog).findByLabelText('Module slug')
    await waitFor(() => expect(input).toHaveFocus())
    await ui.keyboard(fixture.module_slug.slice(0, 4))
    await ui.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    // The row's own menu button — the one Delete was chosen from — has focus
    // again, as a keyboard user needs it to.
    const trigger = within(await findRow(fixture.module_name)).getByRole('button', { name: 'Open menu' })
    await waitFor(() => expect(trigger).toHaveFocus())

    await chooseRowMenuItem(ui, fixture.module_name, 'Delete')
    const again = await screen.findByRole('alertdialog', { name: 'Delete Module' })
    expect(within(again).queryByLabelText('Module slug')).not.toBeInTheDocument()
    expect(again).toHaveTextContent(`Deleting ${fixture.module_name} removes the module`)

    // Still there: nothing was deleted.
    const rows = (await (await db(`/modules?module_slug=eq.${fixture.module_slug}`)).json()) as unknown[]
    expect(rows).toHaveLength(1)
  })
})
