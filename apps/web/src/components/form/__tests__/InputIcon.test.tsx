import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputIcon } from '../InputIcon'
import { renderControl } from './harness'

describe('InputIcon', () => {
  it('says there is no icon yet', () => {
    renderControl(<InputIcon name="icon_name" label="Icon Name" />)
    expect(screen.getByText('No icon')).toBeInTheDocument()
  })

  it('is named by its label, through the pencil the label points at', () => {
    renderControl(<InputIcon name="icon_name" label="Icon Name" />)
    const button = document.getElementById('icon_name')
    expect(button?.tagName).toBe('BUTTON')
    expect(button).toHaveAccessibleName(/Icon Name/)
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
    expect(screen.getByText('house')).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector('[data-slot="input-group-addon"] svg')).not.toBeNull()
    })
  })

  it('opens the picker from the pencil and selects an icon', async () => {
    const user = userEvent.setup()
    renderControl(<InputIcon name="icon_name" label="Icon Name" />)

    await user.click(screen.getByRole('button', { name: /Choose an icon/ }))
    expect(await screen.findByRole('dialog', { name: 'Choose an icon' })).toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: 'Search icons' })
    await user.type(search, 'house')

    await user.click(await screen.findByRole('button', { name: /^house$/ }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByText('house')).toBeInTheDocument()
  })

  it('filters the picker and reports when nothing matches', async () => {
    const user = userEvent.setup()
    renderControl(<InputIcon name="icon_name" label="Icon Name" />)

    await user.click(screen.getByRole('button', { name: /Choose an icon/ }))
    await user.type(screen.getByRole('textbox', { name: 'Search icons' }), 'zzzz-not-an-icon')
    expect(await screen.findByText('No icon found.')).toBeInTheDocument()
  })

  it('clears the value and returns focus to the pencil', async () => {
    const user = userEvent.setup()
    renderControl(<InputIcon name="icon_name" label="Icon Name" />, {
      defaultValues: { icon_name: 'house' },
    })

    await user.click(screen.getByRole('button', { name: 'Clear icon' }))
    expect(screen.getByText('No icon')).toBeInTheDocument()
    expect(document.activeElement).toBe(document.getElementById('icon_name'))
  })

  it('disables the pencil when the field is readonly', () => {
    renderControl(<InputIcon name="icon_name" label="Icon Name" inputMode="readonly" />, {
      defaultValues: { icon_name: 'house' },
    })
    expect(screen.getByRole('button', { name: /Choose an icon/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Clear icon' })).not.toBeInTheDocument()
  })

  it('renders nothing but the hidden input when hidden', () => {
    const { container } = renderControl(
      <InputIcon name="icon_name" label="Icon Name" inputMode="hidden" />,
    )
    expect(screen.queryByText('No icon')).not.toBeInTheDocument()
    expect(container.querySelector('input[type="hidden"]')).toBeInTheDocument()
  })
})
