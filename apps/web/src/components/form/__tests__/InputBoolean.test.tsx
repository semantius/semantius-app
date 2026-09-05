import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputBoolean } from '../InputBoolean'
import { renderControl } from './harness'

describe('InputBoolean', () => {
  it('should render checkbox', () => {
    renderControl(<InputBoolean name="agree" />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('is named by its label', () => {
    renderControl(<InputBoolean name="agree" label="I agree" />)
    expect(screen.getByRole('checkbox', { name: 'I agree' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(<InputBoolean name="agree" label="I agree" description="Required to continue" />)
    expect(screen.getByRole('checkbox', { name: 'I agree' })).toHaveAccessibleDescription(
      'Required to continue',
    )
  })

  it('should be checked when value is true', () => {
    renderControl(<InputBoolean name="agree" />, { defaultValues: { agree: true } })
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  })

  it('should not show required indicator even when required prop is passed', () => {
    renderControl(<InputBoolean name="agree" label="I agree" inputMode="required" />)
    // Should not show required asterisk for boolean/checkbox
    expect(screen.queryByText('*')).not.toBeInTheDocument()
  })

  it('should handle default value of false', () => {
    renderControl(<InputBoolean name="agree" />, { defaultValues: { agree: false } })
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false')
  })

  it('should handle default value of true', () => {
    renderControl(<InputBoolean name="agree" />, { defaultValues: { agree: true } })
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  })
})
