import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputIri } from '../InputIri'
import { renderControl } from './harness'

describe('InputIri', () => {
  it('should render iri input', () => {
    const { container } = renderControl(<InputIri name="iri" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('is named by its label', () => {
    renderControl(<InputIri name="iri" label="Resource IRI" />)
    expect(screen.getByRole('textbox', { name: 'Resource IRI' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputIri name="iri" label="Resource IRI" description="Unicode characters are accepted" />,
    )
    expect(screen.getByRole('textbox', { name: 'Resource IRI' })).toHaveAccessibleDescription(
      'Unicode characters are accepted',
    )
  })
})
