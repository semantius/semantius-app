import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputDateTime } from '../InputDateTime'
import { chromeAccessibleName } from '@/test/chromeAccessibleName'
import { renderControl } from './harness'

describe('InputDateTime', () => {
  it('should render date button and time input', () => {
    const { container } = renderControl(<InputDateTime name="datetime" />)
    expect(container.querySelector('button')).toBeTruthy()
    expect(container.querySelector('input[type="time"]')).toBeTruthy()
  })

  it('should have proper styling with border', () => {
    const { container } = renderControl(<InputDateTime name="datetime" />)
    const button = container.querySelector('button')
    const timeInput = container.querySelector('input[type="time"]')
    expect(button?.className).toContain('border')
    expect(timeInput?.className).toContain('border')
  })

  it('is named by its label', () => {
    // The date half is a <button>, which no <label htmlFor> names. It names
    // itself through aria-labelledby = "<label id> <own id>", so the field is
    // announced first and the chosen date — or the placeholder — second.
    //
    // jest-dom sees only the label half: dom-accessibility-api treats the
    // self-reference as a cycle and drops it, so it reports "Event Time"
    // alone. The full name is asserted against Chrome's own accessibility tree
    // in the next test; encoding the library's answer here would make its
    // limitation the contract.
    renderControl(<InputDateTime name="datetime" label="Event Time" />)
    expect(screen.getByRole('button', { name: /^Event Time/ })).toHaveAccessibleName(
      /^Event Time\b/,
    )
  })

  it('announces the field name, then the current value', async () => {
    // Chrome's accessibility tree, not a JavaScript approximation of it.
    renderControl(<InputDateTime name="datetime" label="Event Time" />, {
      defaultValues: { datetime: '2024-01-15T12:00:00.000Z' },
    })
    const trigger = screen.getByRole('button', { name: /^Event Time/ })
    expect(await chromeAccessibleName(trigger)).toBe('Event Time January 15th, 2024')
  })

  it('names the time half after the field', () => {
    // A second, separately focusable control with no label of its own.
    const { container } = renderControl(<InputDateTime name="datetime" label="Event Time" />)
    expect(container.querySelector('input[type="time"]')).toHaveAccessibleName('Event Time time')
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputDateTime
        name="datetime"
        label="Event Time"
        description="Select the event date and time"
      />,
    )
    expect(screen.getByRole('button', { name: /^Event Time/ })).toHaveAccessibleDescription(
      'Select the event date and time',
    )
  })

  it('should show required indicator when field is required', () => {
    renderControl(<InputDateTime name="datetime" label="DateTime" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should support validation via validators prop', () => {
    const { container } = renderControl(
      <InputDateTime
        name="datetime"
        label="DateTime"
        inputMode="required"
        validators={{
          onBlur: () => 'must not be empty',
          onSubmit: () => 'must not be empty',
        }}
      />,
    )
    // Test that the component accepts validators prop without error
    expect(container.querySelector('button')).toBeTruthy()
    expect(container.querySelector('input[type="time"]')).toBeTruthy()
  })

  it('should display label and description', () => {
    renderControl(
      <InputDateTime
        name="datetime"
        label="Event Time"
        description="Select the event date and time"
      />,
    )
    expect(screen.getByText('Event Time')).toBeInTheDocument()
    expect(screen.getByText('Select the event date and time')).toBeInTheDocument()
  })
})
