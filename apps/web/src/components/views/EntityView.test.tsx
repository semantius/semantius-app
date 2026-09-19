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
})
