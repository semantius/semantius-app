import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputEmail } from '../InputEmail'
import { renderControl } from './harness'

describe('InputEmail', () => {
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const formatValidator = ({ value }: { value: string }) => {
    if (!value) return undefined
    return !EMAIL.test(value) ? 'must match format "email"' : undefined
  }

  it('should render email input type', () => {
    const { container } = renderControl(<InputEmail name="email" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'email')
  })

  it('is named by its label', () => {
    renderControl(<InputEmail name="email" label="Work email" />)
    expect(screen.getByRole('textbox', { name: 'Work email' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(<InputEmail name="email" label="Work email" description="We never share this" />)
    expect(screen.getByRole('textbox', { name: 'Work email' })).toHaveAccessibleDescription(
      'We never share this',
    )
  })

  it('should show required indicator when required', () => {
    renderControl(<InputEmail name="email" label="Email" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should validate required field', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputEmail
        name="email"
        label="Email"
        inputMode="required"
        validators={{
          onBlur: ({ value }) => (!value ? 'must not be empty' : undefined),
        }}
      />,
    )

    const input = screen.getByLabelText(/email/i)
    await user.click(input)
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must not be empty/i)).toBeInTheDocument()
    })
  })

  it('should detect invalid email format', async () => {
    const user = userEvent.setup()
    renderControl(<InputEmail name="email" label="Email" validators={{ onBlur: formatValidator }} />)

    const input = screen.getByLabelText(/email/i)
    await user.type(input, 'invalid-email')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must match format "email"/i)).toBeInTheDocument()
    })
  })

  it('should accept valid email', async () => {
    const user = userEvent.setup()
    renderControl(<InputEmail name="email" label="Email" validators={{ onBlur: formatValidator }} />)

    const input = screen.getByLabelText(/email/i) as HTMLInputElement
    await user.type(input, 'user@example.com')
    await user.tab()

    await waitFor(() => {
      expect(screen.queryByText(/must match format "email"/i)).not.toBeInTheDocument()
      expect(input.value).toBe('user@example.com')
    })
  })

  it('should handle default value', () => {
    const { container } = renderControl(<InputEmail name="email" />, {
      defaultValues: { email: 'default@example.com' },
    })
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('default@example.com')
  })
})
