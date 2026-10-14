import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputColor } from '../InputColor'
import { renderControl } from './harness'

describe('InputColor', () => {
  it('says there is no color yet', () => {
    renderControl(<InputColor name="logo_color" label="Logo Color" />)
    expect(screen.getByRole('combobox', { name: /Logo Color/ })).toHaveTextContent('No color')
  })

  it('is named by its label, through the field the label points at', () => {
    renderControl(<InputColor name="logo_color" label="Logo Color" />)
    const trigger = document.getElementById('logo_color')
    expect(trigger?.tagName).toBe('BUTTON')
    expect(trigger).toHaveAccessibleName(/Logo Color/)
    expect(trigger).toHaveAttribute('role', 'combobox')
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputColor name="logo_color" label="Logo Color" description="Shown on the module tile" />,
    )
    expect(document.getElementById('logo_color')).toHaveAccessibleDescription(
      'Shown on the module tile',
    )
  })

  it('shows the required indicator', () => {
    renderControl(<InputColor name="logo_color" label="Logo Color" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('renders the current color value', () => {
    renderControl(<InputColor name="logo_color" label="Logo Color" />, {
      defaultValues: { logo_color: '#0000ff' },
    })
    expect(screen.getByRole('combobox', { name: /Logo Color/ })).toHaveTextContent('#0000FF')
  })

  it('opens the picker as a dropdown, not a dialog', async () => {
    const user = userEvent.setup()
    renderControl(<InputColor name="logo_color" label="Logo Color" />)

    await user.click(screen.getByRole('combobox', { name: /Logo Color/ }))
    expect(await screen.findByRole('slider', { name: 'Color' })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull()
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
    expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull()
  })

  it('opens the picker from the field and commits a typed hex value', async () => {
    const user = userEvent.setup()
    renderControl(<InputColor name="logo_color" label="Logo Color" />)

    await user.click(screen.getByRole('combobox', { name: /Logo Color/ }))
    const hex = await screen.findByRole('textbox', { name: 'Hex' })
    await user.clear(hex)
    await user.type(hex, '#ff0000')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Logo Color/ })).toHaveTextContent('#FF0000')
    })
  })

  it('hides the clear button until the field has a value, matching other pickers', () => {
    renderControl(<InputColor name="logo_color" label="Logo Color" />)
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()
  })

  it('reveals a dropdown-sized clear button only while the field is hovered or open', () => {
    renderControl(<InputColor name="logo_color" label="Logo Color" />, {
      defaultValues: { logo_color: '#0000ff' },
    })
    const clear = screen.getByRole('button', { name: 'Clear selection' })
    expect(clear.className).toMatch(/opacity-0/)
    expect(clear.className).toMatch(/group-hover\/combobox:opacity-100/)
    expect(clear.querySelector('svg')).toHaveClass('h-3', 'w-3', 'opacity-50')
  })

  it('clears the value and returns focus to the field', async () => {
    const user = userEvent.setup()
    renderControl(<InputColor name="logo_color" label="Logo Color" />, {
      defaultValues: { logo_color: '#0000ff' },
    })

    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByRole('combobox', { name: /Logo Color/ })).toHaveTextContent('No color')
    expect(document.activeElement).toBe(document.getElementById('logo_color'))
  })

  it('disables the field when readonly and hides the clear button', () => {
    renderControl(<InputColor name="logo_color" label="Logo Color" inputMode="readonly" />, {
      defaultValues: { logo_color: '#0000ff' },
    })
    expect(screen.getByRole('combobox', { name: /Logo Color/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()
  })

  it('disables the field when disabled', () => {
    renderControl(<InputColor name="logo_color" label="Logo Color" inputMode="disabled" />, {
      defaultValues: { logo_color: '#0000ff' },
    })
    expect(screen.getByRole('combobox', { name: /Logo Color/ })).toBeDisabled()
  })

  it('renders nothing but the hidden input when hidden', () => {
    const { container } = renderControl(
      <InputColor name="logo_color" label="Logo Color" inputMode="hidden" />,
    )
    expect(screen.queryByText('No color')).not.toBeInTheDocument()
    expect(container.querySelector('input[type="hidden"]')).toBeInTheDocument()
  })

  it('switches the value field between hex, rgb and hsl', async () => {
    const user = userEvent.setup()
    renderControl(<InputColor name="logo_color" label="Logo Color" />, {
      defaultValues: { logo_color: '#ff0000' },
    })

    await user.click(screen.getByRole('combobox', { name: /Logo Color/ }))
    await user.click(await screen.findByRole('button', { name: 'rgb' }))
    expect(await screen.findByRole('textbox', { name: 'RGB' })).toHaveValue('rgb(255 0 0)')

    await user.click(screen.getByRole('button', { name: 'hsl' }))
    expect(await screen.findByRole('textbox', { name: 'HSL' })).toHaveValue('hsl(0 100% 50%)')
  })
})
