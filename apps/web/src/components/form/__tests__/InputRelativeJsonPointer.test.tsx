import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputRelativeJsonPointer } from '../InputRelativeJsonPointer'
import { renderControl } from './harness'

describe('InputRelativeJsonPointer', () => {
  it('should render relative-json-pointer input', () => {
    const { container } = renderControl(<InputRelativeJsonPointer name="pointer" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('is named by its label', () => {
    renderControl(<InputRelativeJsonPointer name="pointer" label="Relative pointer" />)
    expect(screen.getByRole('textbox', { name: 'Relative pointer' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputRelativeJsonPointer
        name="pointer"
        label="Relative pointer"
        description="Relative to the current location"
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Relative pointer' })).toHaveAccessibleDescription(
      'Relative to the current location',
    )
  })
})
