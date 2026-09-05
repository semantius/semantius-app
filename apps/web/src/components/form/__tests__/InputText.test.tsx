import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputText } from '../InputText'
import { renderControl } from './harness'

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
})
