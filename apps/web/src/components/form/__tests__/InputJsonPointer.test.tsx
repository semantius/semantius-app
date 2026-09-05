import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputJsonPointer } from '../InputJsonPointer'
import { renderControl } from './harness'

describe('InputJsonPointer', () => {
  it('should render json-pointer input', () => {
    const { container } = renderControl(<InputJsonPointer name="pointer" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('is named by its label', () => {
    renderControl(<InputJsonPointer name="pointer" label="Pointer" />)
    expect(screen.getByRole('textbox', { name: 'Pointer' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputJsonPointer name="pointer" label="Pointer" description="RFC 6901 JSON Pointer" />,
    )
    expect(screen.getByRole('textbox', { name: 'Pointer' })).toHaveAccessibleDescription(
      'RFC 6901 JSON Pointer',
    )
  })
})
