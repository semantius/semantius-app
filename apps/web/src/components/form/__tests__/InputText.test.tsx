import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputText } from '../InputText'
import { renderControl } from './harness'

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

  it('opens the long description on click and still describes the input while closed', async () => {
    const user = userEvent.setup()
    renderControl(<InputText name="testField" label="Username" description={LONG_HINT} />)

    const input = screen.getByRole('textbox', { name: 'Username' })
    expect(input).toHaveAccessibleDescription(LONG_HINT)

    await user.click(screen.getByRole('button', { name: 'Extended documentation guide for Username' }))
    await waitFor(() => {
      expect(screen.getAllByText(LONG_HINT).length).toBe(2)
    })
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
})
