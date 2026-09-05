import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputIdnEmail } from '../InputIdnEmail'
import { renderControl } from './harness'

describe('InputIdnEmail', () => {
  it('should render idn-email input', () => {
    const { container } = renderControl(<InputIdnEmail name="email" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'email')
  })

  it('is named by its label', () => {
    renderControl(<InputIdnEmail name="email" label="Contact address" />)
    expect(screen.getByRole('textbox', { name: 'Contact address' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputIdnEmail
        name="email"
        label="Contact address"
        description="Unicode local parts are accepted"
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Contact address' })).toHaveAccessibleDescription(
      'Unicode local parts are accepted',
    )
  })
})
