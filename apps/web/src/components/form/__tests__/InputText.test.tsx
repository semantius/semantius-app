import { describe, it, expect } from 'vitest'
import { screen, waitFor, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { disableCollector } from '@/i18n/missing'
import { InputText } from '../InputText'
import { FormHarness, renderControl } from './harness'

const LONG_HINT =
  'This description is deliberately longer than six words so the field collapses it.'

describe('InputText', () => {
  it('should render with label', () => {
    renderControl(<InputText name="testField" label="Username" />)
    expect(screen.getByText('Username')).toBeInTheDocument()
  })

  it('is named by its label', () => {
    renderControl(<InputText name="testField" label="Username" />)
    expect(screen.getByRole('textbox', { name: 'Username' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputText name="testField" label="Username" description="Enter your username" />,
    )
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveAccessibleDescription(
      'Enter your username',
    )
  })

  it('should show required indicator', () => {
    renderControl(<InputText name="testField" label="Username" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should display description', () => {
    renderControl(<InputText name="testField" description="Enter your username" />)
    expect(screen.getByText('Enter your username')).toBeInTheDocument()
  })

  it('should execute validator and show error', async () => {
    const { container } = renderControl(
      <InputText
        name="testField"
        label="Username"
        validators={{
          onBlur: ({ value }) => (value ? undefined : 'This field is required'),
        }}
      />,
    )

    const input = container.querySelector('input')

    // Trigger blur to run validation
    input?.focus()
    input?.blur()

    // Wait for validation
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(screen.queryByText('This field is required')).toBeInTheDocument()
  })

  it('should handle default value', () => {
    const { container } = renderControl(<InputText name="testField" />, {
      defaultValues: { testField: 'default text' },
    })
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('default text')
  })

  it('keeps a short description visible below the control', () => {
    renderControl(
      <InputText name="testField" label="Username" description="Enter your username" />,
    )
    expect(screen.getByText('Enter your username')).not.toHaveClass('sr-only')
    expect(
      screen.queryByRole('button', { name: 'Extended documentation guide for Username' }),
    ).not.toBeInTheDocument()
  })

  it('collapses a long description into a label-adjacent help button', () => {
    renderControl(<InputText name="testField" label="Username" description={LONG_HINT} />)
    expect(screen.getByText(LONG_HINT)).toHaveClass('sr-only')
    expect(
      screen.getByRole('button', { name: 'Extended documentation guide for Username' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveAccessibleDescription(LONG_HINT)
  })

  it('collapses a short-word description that does not fit the field column', async () => {
    render(
      <div style={{ width: 48 }}>
        <FormHarness>
          <InputText name="testField" label="Username" description="Work address" />
        </FormHarness>
      </div>,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Extended documentation guide for Username' }),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('Work address')).toHaveClass('sr-only')
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveAccessibleDescription(
      'Work address',
    )
  })

  it('keeps the same short description inline when the field is wide enough', () => {
    render(
      <div style={{ width: 480 }}>
        <FormHarness>
          <InputText name="testField" label="Username" description="Work address" />
        </FormHarness>
      </div>,
    )
    expect(screen.getByText('Work address')).not.toHaveClass('sr-only')
    expect(
      screen.queryByRole('button', { name: 'Extended documentation guide for Username' }),
    ).not.toBeInTheDocument()
  })

  it('does not treat forty characters as a collapse quota on a wide field', () => {
    // Two words, 41 characters — over the sample snippet's "40" and under the
    // six-word rule. A 480px column holds this on one line, so it stays inline.
    disableCollector()
    const hint = 'Internationalization configuration helper'
    render(
      <div style={{ width: 480 }}>
        <FormHarness>
          <InputText name="testField" label="Username" description={hint} />
        </FormHarness>
      </div>,
    )
    expect(hint.length).toBeGreaterThan(40)
    expect(screen.getByText(hint)).not.toHaveClass('sr-only')
    expect(
      screen.queryByRole('button', { name: 'Extended documentation guide for Username' }),
    ).not.toBeInTheDocument()
  })

  it('opens the long description on click and still describes the input while closed', async () => {
    const user = userEvent.setup()
    renderControl(<InputText name="testField" label="Username" description={LONG_HINT} />)

    const input = screen.getByRole('textbox', { name: 'Username' })
    expect(input).toHaveAccessibleDescription(LONG_HINT)

    await user.click(screen.getByRole('button', { name: 'Extended documentation guide for Username' }))
    await waitFor(() => {
      expect(screen.getAllByText(LONG_HINT).length).toBe(2)
    })
    expect(document.querySelector('[data-slot="popover-arrow"]')).toBeTruthy()
    expect(input).toHaveAccessibleDescription(LONG_HINT)
  })

  it('opens the popover with Enter or Space and closes it with Escape', async () => {
    const user = userEvent.setup()
    renderControl(<InputText name="testField" label="Username" description={LONG_HINT} />)

    const help = screen.getByRole('button', { name: 'Extended documentation guide for Username' })
    help.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(screen.getAllByText(LONG_HINT).length).toBe(2)
    })

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.getAllByText(LONG_HINT)).toHaveLength(1)
    })

    help.focus()
    await user.keyboard(' ')
    await waitFor(() => {
      expect(screen.getAllByText(LONG_HINT).length).toBe(2)
    })
  })

  it('lets Tab leave the open popover and land on the field', async () => {
    const user = userEvent.setup()
    renderControl(<InputText name="testField" label="Username" description={LONG_HINT} />)

    const help = screen.getByRole('button', { name: 'Extended documentation guide for Username' })
    await user.click(help)
    await waitFor(() => {
      expect(screen.getAllByText(LONG_HINT).length).toBe(2)
    })
    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveFocus()
  })

  it('does not show the help button in view mode', () => {
    renderControl(<InputText name="testField" label="Username" description={LONG_HINT} />, {
      formMode: 'view',
    })
    expect(
      screen.queryByRole('button', { name: 'Extended documentation guide for Username' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(LONG_HINT)).not.toBeInTheDocument()
  })

  it('opens the long description on hover without moving focus', async () => {
    const user = userEvent.setup()
    renderControl(<InputText name="testField" label="Username" description={LONG_HINT} />)

    const input = screen.getByRole('textbox', { name: 'Username' })
    input.focus()
    await user.hover(
      screen.getByRole('button', { name: 'Extended documentation guide for Username' }),
    )
    await waitFor(() => {
      expect(screen.getAllByText(LONG_HINT).length).toBe(2)
    })
    expect(input).toHaveFocus()
    expect(input).toHaveAccessibleDescription(LONG_HINT)
  })

  it('does not open the hint on keyboard focus alone', async () => {
    renderControl(<InputText name="testField" label="Username" description={LONG_HINT} />)

    screen.getByRole('button', { name: 'Extended documentation guide for Username' }).focus()
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.getAllByText(LONG_HINT)).toHaveLength(1)
  })

  it('keeps a hover-opened hint open when the pointer then clicks the icon', async () => {
    const user = userEvent.setup()
    renderControl(<InputText name="testField" label="Username" description={LONG_HINT} />)

    const help = screen.getByRole('button', { name: 'Extended documentation guide for Username' })
    await user.hover(help)
    await waitFor(() => {
      expect(screen.getAllByText(LONG_HINT).length).toBe(2)
    })
    // Past Base UI's 500ms stickIfOpen window: without canceling the press,
    // this click would close (and hover would reopen).
    await new Promise((resolve) => setTimeout(resolve, 600))
    await user.click(help)
    expect(screen.getAllByText(LONG_HINT).length).toBe(2)
    expect(document.querySelector('[data-slot="popover-arrow"]')).toBeTruthy()
  })

  it('does not present the hint bubble as a modal dialog', async () => {
    const user = userEvent.setup()
    renderControl(<InputText name="testField" label="Username" description={LONG_HINT} />)

    await user.hover(
      screen.getByRole('button', { name: 'Extended documentation guide for Username' }),
    )
    await waitFor(() => {
      expect(screen.getAllByText(LONG_HINT).length).toBe(2)
    })
    const popup = document.querySelector('[data-slot="popover-content"]')
    expect(popup).toHaveAttribute('data-field-hint')
    expect(popup).toHaveAttribute('role', 'note')
  })
})
