import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@/test/render'
import { appError } from '@/lib/appError'
import type { DeleteConfirmationProps } from '@/components/data-table-view/DataTableView'
import { ConfirmDeleteModuleDialog } from './ConfirmDeleteModuleDialog'

/**
 * The two-step module delete confirmation, on its own.
 *
 * The grid's side of it — the mutation, the refetch, the toast, and mounting a
 * fresh dialog per Delete — is exercised end to end in `Modules.test.tsx`. Here
 * the props the grid would pass are supplied by hand, and `handleConfirm` /
 * `handleCancel` are plain `vi.fn()` callbacks: they are the component's
 * outputs, not stand-ins for anything it imports.
 *
 * The i18n collector stays ON: this is the file that renders the dialog's four
 * new messages and so records them. The module's name and slug below are
 * interpolated VALUES, never message keys, so they are not recorded; and the
 * error case uses a message the app already ships.
 */

const RECORD = { id: 1, module_name: 'Sales Pipeline', module_slug: 'sales_pipeline' }

function props(overrides: Partial<DeleteConfirmationProps> = {}): DeleteConfirmationProps {
  return {
    record: RECORD,
    displayName: 'Sales Pipeline',
    entityType: 'Module',
    isOpen: true,
    setIsOpen: vi.fn(),
    isPending: false,
    error: null,
    handleConfirm: vi.fn(),
    handleCancel: vi.fn(),
    ...overrides,
  }
}

/** Render, then take the dialog to step 2 through its own Delete button. */
async function atStep2(p: DeleteConfirmationProps) {
  const ui = userEvent.setup()
  const view = render(<ConfirmDeleteModuleDialog {...p} />)
  await ui.click(await screen.findByRole('button', { name: 'Delete' }))
  const input = await screen.findByLabelText('Module slug')
  await waitFor(() => expect(input).toHaveFocus())
  return { ui, input, ...view }
}

describe('ConfirmDeleteModuleDialog', () => {
  it('opens at step 1: the title, the warning naming the module, and an enabled Delete', async () => {
    render(<ConfirmDeleteModuleDialog {...props()} />)

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Module' })
    expect(dialog).toHaveTextContent(
      'Deleting Sales Pipeline removes the module, every entity in it, their database tables and their permissions. This action cannot be undone.',
    )
    expect(screen.getByText('Sales Pipeline').tagName).toBe('STRONG')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(screen.queryByLabelText('Module slug')).not.toBeInTheDocument()
  })

  it('has a sentence of its own for a module with no name', async () => {
    render(<ConfirmDeleteModuleDialog {...props({ displayName: '' })} />)

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Deleting this module removes it, every entity in it, their database tables and their permissions. This action cannot be undone.',
    )
  })

  it('advances to step 2 on Delete without deleting anything', async () => {
    const p = props()
    await atStep2(p)

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Type sales_pipeline to confirm.')
    expect(screen.getByText('sales_pipeline').tagName).toBe('STRONG')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(p.handleConfirm).not.toHaveBeenCalled()
  })

  it('keeps Delete disabled for the slug in the wrong case', async () => {
    const { ui } = await atStep2(props())

    await ui.keyboard('SALES_PIPELINE')

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('ignores a space before or after the slug, and nothing else', async () => {
    const p = props()
    const { ui, input } = await atStep2(p)

    // A copied slug can carry a trailing space; it still confirms.
    await ui.keyboard(' sales_pipeline ')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()

    // A space INSIDE is a different string.
    await ui.clear(input)
    await ui.keyboard('sales _pipeline')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    await ui.keyboard('{Enter}')
    expect(p.handleConfirm).not.toHaveBeenCalled()
  })

  it('enables Delete for the exact slug, and deletes once on click', async () => {
    const p = props()
    const { ui } = await atStep2(p)

    await ui.keyboard('sales_pipeline')
    const del = screen.getByRole('button', { name: 'Delete' })
    expect(del).toBeEnabled()
    await ui.click(del)

    expect(p.handleConfirm).toHaveBeenCalledTimes(1)
  })

  it('confirms on Enter only once the slug matches', async () => {
    const p = props()
    const { ui } = await atStep2(p)

    await ui.keyboard('sales{Enter}')
    expect(p.handleConfirm).not.toHaveBeenCalled()

    await ui.keyboard('_pipeline{Enter}')
    expect(p.handleConfirm).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the module has no slug', async () => {
    const p = props({ record: { ...RECORD, module_slug: '' } })
    const { ui } = await atStep2(p)

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    await ui.keyboard(' {Enter}')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(p.handleConfirm).not.toHaveBeenCalled()
  })

  it('cancels from step 2', async () => {
    const p = props()
    const { ui } = await atStep2(p)

    await ui.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(p.handleCancel).toHaveBeenCalledTimes(1)
    expect(p.handleConfirm).not.toHaveBeenCalled()
  })

  it('locks the field and both buttons while the delete is pending', async () => {
    const p = props()
    const { ui, input, rerender } = await atStep2(p)
    await ui.keyboard('sales_pipeline')

    rerender(<ConfirmDeleteModuleDialog {...p} isPending />)

    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled()
  })

  it('shows a failed delete as an alert and stays open', async () => {
    const p = props()
    const { rerender } = await atStep2(p)

    rerender(
      <ConfirmDeleteModuleDialog
        {...p}
        // The error useDeleteRecord really throws when the row is already gone.
        error={appError({ message: 'This {table} record no longer exists', values: { table: 'modules' } })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('This modules record no longer exists')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Module slug')).toBeInTheDocument()
  })
})
