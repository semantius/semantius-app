import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputIdnHostname } from '../InputIdnHostname'
import { renderControl } from './harness'

describe('InputIdnHostname', () => {
  it('should render idn-hostname input', () => {
    const { container } = renderControl(<InputIdnHostname name="hostname" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('is named by its label', () => {
    renderControl(<InputIdnHostname name="hostname" label="Server name" />)
    expect(screen.getByRole('textbox', { name: 'Server name' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputIdnHostname
        name="hostname"
        label="Server name"
        description="Unicode labels are accepted"
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Server name' })).toHaveAccessibleDescription(
      'Unicode labels are accepted',
    )
  })
})
