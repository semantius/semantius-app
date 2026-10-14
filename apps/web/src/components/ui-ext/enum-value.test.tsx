import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { EnumBadge, EnumValue } from './enum-value'

describe('EnumBadge', () => {
  it('paints the schema color as the badge background', () => {
    render(<EnumBadge label="Picking" color="#FDBA74" />)
    expect(screen.getByText('Picking')).toHaveStyle({ backgroundColor: 'rgb(253, 186, 116)' })
  })

  it('keeps the fallback variant when the entry has no color', () => {
    const { container } = render(<EnumBadge label="Active" variant="default" />)
    const badge = container.querySelector('[data-slot="badge"]') ?? screen.getByText('Active')
    expect(badge).not.toHaveStyle({ backgroundColor: 'rgb(253, 186, 116)' })
    expect(badge).toHaveTextContent('Active')
  })

  it('renders a named icon to the left of the label', async () => {
    const { container } = render(<EnumBadge label="Shipped" icon="truck" color="#86EFAC" />)
    expect(screen.getByText('Shipped')).toHaveTextContent('Shipped')
    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull()
    })
  })
})

describe('EnumValue', () => {
  it('renders the label without an icon when none is set', () => {
    render(<EnumValue label="Pending" />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })
})
