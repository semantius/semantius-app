import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputUriReference } from '../InputUriReference'
import { renderControl } from './harness'

describe('InputUriReference', () => {
  it('should render uri-reference input', () => {
    const { container } = renderControl(<InputUriReference name="uriRef" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('is named by its label', () => {
    renderControl(<InputUriReference name="uriRef" label="URI reference" />)
    expect(screen.getByRole('textbox', { name: 'URI reference' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputUriReference name="uriRef" label="URI reference" description="May be relative" />,
    )
    expect(screen.getByRole('textbox', { name: 'URI reference' })).toHaveAccessibleDescription(
      'May be relative',
    )
  })
})
