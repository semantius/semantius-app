import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputIcon } from '../InputIcon'
import { renderControl } from './harness'

describe('InputIcon', () => {
  it('says there is no icon yet', () => {
    renderControl(<InputIcon name="icon_name" label="Icon Name" />)
    expect(screen.getByRole('combobox', { name: /Icon Name/ })).toHaveTextContent('No icon')
  })

  it('is named by its label, through the field the label points at', () => {
    renderControl(<InputIcon name="icon_name" label="Icon Name" />)
    const trigger = document.getElementById('icon_name')
    expect(trigger?.tagName).toBe('BUTTON')
    expect(trigger).toHaveAccessibleName(/Icon Name/)
    expect(trigger).toHaveAttribute('role', 'combobox')
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputIcon name="icon_name" label="Icon Name" description="Shown on the module tile" />,
    )
    expect(document.getElementById('icon_name')).toHaveAccessibleDescription(
      'Shown on the module tile',
    )
  })

  it('shows the required indicator', () => {
    renderControl(<InputIcon name="icon_name" label="Icon Name" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('renders the current icon and its name', async () => {
    const { container } = renderControl(<InputIcon name="icon_name" label="Icon Name" />, {
      defaultValues: { icon_name: 'house' },
    })
    expect(screen.getByRole('combobox', { name: /Icon Name/ })).toHaveTextContent('house')
    await waitFor(() => {
      expect(container.querySelector('[data-slot="button"] svg')).not.toBeNull()
    })
  })

  it('has no pencil; the field itself opens the picker', () => {
    renderControl(<InputIcon name="icon_name" label="Icon Name" />)
    expect(screen.queryByRole('button', { name: /^Choose an icon$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Icon Name/ })).toBeInTheDocument()
  })

  it('opens the picker when the field is focused', async () => {
    renderControl(<InputIcon name="icon_name" label="Icon Name" />)

    screen.getByRole('combobox', { name: /Icon Name/ }).focus()
    expect(await screen.findByRole('textbox', { name: 'Search icons' })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull()
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
    expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull()
  })

  it('opens the picker from the field and selects an icon', async () => {
    const user = userEvent.setup()
    renderControl(<InputIcon name="icon_name" label="Icon Name" />)

    await user.click(screen.getByRole('combobox', { name: /Icon Name/ }))
    expect(await screen.findByRole('textbox', { name: 'Search icons' })).toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: 'Search icons' })
    await user.type(search, 'house')

    await user.click(await screen.findByRole('button', { name: /^house$/ }))

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Search icons' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('combobox', { name: /Icon Name/ })).toHaveTextContent('house')
  })

  it('filters the picker and reports when nothing matches', async () => {
    const user = userEvent.setup()
    renderControl(<InputIcon name="icon_name" label="Icon Name" />)

    await user.click(screen.getByRole('combobox', { name: /Icon Name/ }))
    await user.type(screen.getByRole('textbox', { name: 'Search icons' }), 'zzzz-not-an-icon')
    expect(await screen.findByText('No icon found.')).toBeInTheDocument()
  })

  it('hides the clear button until the field has a value, matching other pickers', () => {
    renderControl(<InputIcon name="icon_name" label="Icon Name" />)
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()
  })

  it('reveals a dropdown-sized clear button only while the field is hovered or open', () => {
    renderControl(<InputIcon name="icon_name" label="Icon Name" />, {
      defaultValues: { icon_name: 'house' },
    })
    const clear = screen.getByRole('button', { name: 'Clear selection' })
    expect(clear.className).toMatch(/opacity-0/)
    expect(clear.className).toMatch(/group-hover\/combobox:opacity-100/)
    expect(clear.querySelector('svg')).toHaveClass('h-3', 'w-3', 'opacity-50')
  })

  it('clears the value and returns focus to the field', async () => {
    const user = userEvent.setup()
    renderControl(<InputIcon name="icon_name" label="Icon Name" />, {
      defaultValues: { icon_name: 'house' },
    })

    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByRole('combobox', { name: /Icon Name/ })).toHaveTextContent('No icon')
    expect(document.activeElement).toBe(document.getElementById('icon_name'))
  })

  it('disables the field when readonly and hides the clear button', () => {
    renderControl(<InputIcon name="icon_name" label="Icon Name" inputMode="readonly" />, {
      defaultValues: { icon_name: 'house' },
    })
    expect(screen.getByRole('combobox', { name: /Icon Name/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()
  })

  it('renders nothing but the hidden input when hidden', () => {
    const { container } = renderControl(
      <InputIcon name="icon_name" label="Icon Name" inputMode="hidden" />,
    )
    expect(screen.queryByText('No icon')).not.toBeInTheDocument()
    expect(container.querySelector('input[type="hidden"]')).toBeInTheDocument()
  })
})
