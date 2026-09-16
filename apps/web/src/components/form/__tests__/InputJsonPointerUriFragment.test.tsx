import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputJsonPointerUriFragment } from '../InputJsonPointerUriFragment'
import { renderControl } from './harness'

describe('InputJsonPointerUriFragment', () => {
  it('is named by its label', () => {
    renderControl(<InputJsonPointerUriFragment name="ptr" label="Target" />)
    expect(screen.getByRole('textbox', { name: 'Target' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputJsonPointerUriFragment name="ptr" label="Target" description="Starts with #" />,
    )
    expect(screen.getByRole('textbox', { name: 'Target' })).toHaveAccessibleDescription('Starts with #')
  })

  it('shows the fragment shape as a placeholder in a monospace face', () => {
    // The leading # and the ~0/~1 escapes are the point of this format, and a
    // proportional face hides the difference between them.
    const { container } = renderControl(<InputJsonPointerUriFragment name="ptr" />)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input).toHaveAttribute('placeholder', '#/path/to/property')
    expect(input.className).toContain('font-mono')
  })

  it('round-trips a pointer with escapes', async () => {
    const user = userEvent.setup()
    renderControl(<InputJsonPointerUriFragment name="ptr" label="Target" />)
    const input = screen.getByRole('textbox', { name: 'Target' }) as HTMLInputElement
    await user.type(input, '#/a~1b/c~0d/0')
    expect(input.value).toBe('#/a~1b/c~0d/0')
  })

  it('shows the required indicator', () => {
    renderControl(<InputJsonPointerUriFragment name="ptr" label="Target" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('is disabled when readonly, and still submits its value', () => {
    const { container } = renderControl(
      <InputJsonPointerUriFragment name="ptr" label="Target" inputMode="readonly" />,
      { defaultValues: { ptr: '#/a' } },
    )
    expect(screen.getByRole('textbox', { name: 'Target' })).toBeDisabled()
    expect((container.querySelector('input[type="hidden"]') as HTMLInputElement).value).toBe('#/a')
  })

  it('renders nothing but the hidden input when hidden', () => {
    const { container } = renderControl(
      <InputJsonPointerUriFragment name="ptr" label="Target" inputMode="hidden" />,
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(container.querySelector('input[type="hidden"]')).toBeInTheDocument()
  })
})
