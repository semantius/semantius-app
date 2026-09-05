import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputUriTemplate } from '../InputUriTemplate'
import { renderControl } from './harness'

describe('InputUriTemplate', () => {
  it('should render uri-template input', () => {
    const { container } = renderControl(<InputUriTemplate name="template" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('is named by its label', () => {
    renderControl(<InputUriTemplate name="template" label="URI template" />)
    expect(screen.getByRole('textbox', { name: 'URI template' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputUriTemplate
        name="template"
        label="URI template"
        description="RFC 6570 URI Template"
      />,
    )
    expect(screen.getByRole('textbox', { name: 'URI template' })).toHaveAccessibleDescription(
      'RFC 6570 URI Template',
    )
  })
})
