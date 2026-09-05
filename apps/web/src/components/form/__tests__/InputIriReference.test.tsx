import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputIriReference } from '../InputIriReference'
import { renderControl } from './harness'

describe('InputIriReference', () => {
  it('should render iri-reference input', () => {
    const { container } = renderControl(<InputIriReference name="iriRef" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('is named by its label', () => {
    renderControl(<InputIriReference name="iriRef" label="IRI reference" />)
    expect(screen.getByRole('textbox', { name: 'IRI reference' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputIriReference name="iriRef" label="IRI reference" description="May be relative" />,
    )
    expect(screen.getByRole('textbox', { name: 'IRI reference' })).toHaveAccessibleDescription(
      'May be relative',
    )
  })
})
