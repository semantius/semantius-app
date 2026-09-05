import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputDate } from '../InputDate'
import { renderControl } from './harness'

describe('InputDate', () => {
  it('should render date picker button and input', () => {
    const { container } = renderControl(<InputDate name="date" />)
    expect(container.querySelector('button')).toBeTruthy()
    expect(screen.getByPlaceholderText('Pick a date')).toBeInTheDocument()
  })

  it('is named by its label', () => {
    // The displayed value is a readonly <input> — the only labelable element in
    // the picker, so that is where <label htmlFor> lands.
    renderControl(<InputDate name="date" label="Birth Date" />)
    expect(screen.getByRole('textbox', { name: 'Birth Date' })).toBeInTheDocument()
  })

  it('names the calendar trigger after the field', () => {
    // The trigger is icon-only, so its name has to say WHICH date it opens — a
    // form with three date fields would otherwise announce "Choose date" thrice.
    renderControl(<InputDate name="date" label="Birth Date" />)
    expect(
      screen.getByRole('button', { name: 'Choose Birth Date from calendar' }),
    ).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputDate name="date" label="Birth Date" description="Select your birth date" />,
    )
    expect(screen.getByRole('textbox', { name: 'Birth Date' })).toHaveAccessibleDescription(
      'Select your birth date',
    )
  })

  it('should show required indicator when field is required', () => {
    renderControl(<InputDate name="date" label="Date" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should support validation via validators prop', () => {
    renderControl(
      <InputDate
        name="date"
        label="Date"
        inputMode="required"
        validators={{
          onBlur: () => 'must not be empty',
        }}
      />,
    )
    // Test that the component accepts validators prop without error
    expect(screen.getByPlaceholderText('Pick a date')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('should display label and description', () => {
    renderControl(
      <InputDate name="date" label="Birth Date" description="Select your birth date" />,
    )
    expect(screen.getByText('Birth Date')).toBeInTheDocument()
    expect(screen.getByText('Select your birth date')).toBeInTheDocument()
  })

  it('should handle default value', () => {
    renderControl(<InputDate name="date" />, { defaultValues: { date: '2024-01-15' } })
    // Date should be formatted and displayed in the input field
    expect(screen.getByDisplayValue(/Jan/)).toBeInTheDocument()
  })
})
