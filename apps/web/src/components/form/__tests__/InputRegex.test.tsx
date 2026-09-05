import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputRegex } from '../InputRegex'
import { renderControl } from './harness'

describe('InputRegex', () => {
  it('should render regex input', () => {
    const { container } = renderControl(<InputRegex name="regex" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('is named by its label', () => {
    renderControl(<InputRegex name="regex" label="Pattern" />)
    expect(screen.getByRole('textbox', { name: 'Pattern' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputRegex name="regex" label="Pattern" description="ECMA-262 regular expression" />,
    )
    expect(screen.getByRole('textbox', { name: 'Pattern' })).toHaveAccessibleDescription(
      'ECMA-262 regular expression',
    )
  })
})
