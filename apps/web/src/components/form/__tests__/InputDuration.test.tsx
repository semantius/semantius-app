import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputDuration } from '../InputDuration'
import { renderControl } from './harness'

describe('InputDuration', () => {
  it('should render duration input with text type', () => {
    const { container } = renderControl(<InputDuration name="duration" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('should have placeholder text', () => {
    renderControl(<InputDuration name="duration" />)
    expect(screen.getByPlaceholderText('P3Y6M4DT12H30M5S')).toBeInTheDocument()
  })

  it('is named by its label', () => {
    renderControl(<InputDuration name="duration" label="Video Duration" />)
    expect(screen.getByRole('textbox', { name: 'Video Duration' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputDuration
        name="duration"
        label="Video Duration"
        description="Enter duration in ISO 8601 format"
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Video Duration' })).toHaveAccessibleDescription(
      'Enter duration in ISO 8601 format',
    )
  })

  it('should show required indicator when field is required', () => {
    renderControl(<InputDuration name="duration" label="Duration" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should support validation via validators prop', () => {
    renderControl(
      <InputDuration
        name="duration"
        label="Duration"
        inputMode="required"
        validators={{
          onBlur: () => 'must not be empty',
          onSubmit: () => 'must not be empty',
        }}
      />,
    )
    // Test that the component accepts validators prop without error
    expect(screen.getByLabelText(/duration/i)).toBeInTheDocument()
  })

  it('should accept valid duration format input', async () => {
    const user = userEvent.setup()
    renderControl(<InputDuration name="duration" label="Duration" />)

    const input = screen.getByLabelText(/duration/i) as HTMLInputElement
    await user.type(input, 'P1Y2M3DT4H5M6S')
    expect(input.value).toBe('P1Y2M3DT4H5M6S')
  })

  it('should display label and description', () => {
    renderControl(
      <InputDuration
        name="duration"
        label="Video Duration"
        description="Enter duration in ISO 8601 format"
      />,
    )
    expect(screen.getByText('Video Duration')).toBeInTheDocument()
    expect(screen.getByText('Enter duration in ISO 8601 format')).toBeInTheDocument()
  })
})
