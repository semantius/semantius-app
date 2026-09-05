import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputIpv6 } from '../InputIpv6'
import { renderControl } from './harness'

describe('InputIpv6', () => {
  it('should render ipv6 input', () => {
    const { container } = renderControl(<InputIpv6 name="ipv6" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('is named by its label', () => {
    renderControl(<InputIpv6 name="ipv6" label="IPv6 address" />)
    expect(screen.getByRole('textbox', { name: 'IPv6 address' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputIpv6 name="ipv6" label="IPv6 address" description="Eight hextets, colon separated" />,
    )
    expect(screen.getByRole('textbox', { name: 'IPv6 address' })).toHaveAccessibleDescription(
      'Eight hextets, colon separated',
    )
  })
})
