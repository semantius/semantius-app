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

  it('renders a text input with the email keyboard, not type=email', () => {
    const { container } = renderControl(<InputEmail name="email" />)
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'email')
  })

  // This control serves `idn-email` as well as `email`. The `typeMismatch`
  // assertion is what holds the type down: under `type="email"` the HTML spec's
  // ASCII-only email regex rejects a non-ASCII local part, and this test fails.
  // (Chromium's punycode rewrite of an IDN DOMAIN is deliberately not asserted —
  // it fires on genuine editing, not on the value-setter path userEvent drives,
  // so such a test would pass under `type="email"` and could never fail.)
  it('accepts a non-ASCII local part', async () => {
    const user = userEvent.setup()
    renderControl(<InputEmail name="email" label="Email" />)

    const input = screen.getByLabelText(/email/i) as HTMLInputElement
    await user.type(input, 'jörg@müller.de')

    expect(input.value).toBe('jörg@müller.de')
    expect(input.validity.typeMismatch).toBe(false)
  })

  it('round-trips an IDN domain, in either spelling', async () => {
    const user = userEvent.setup()
    renderControl(<InputEmail name="email" label="Email" />)

    const input = screen.getByLabelText(/email/i) as HTMLInputElement
    await user.type(input, 'user@xn--mller-kva.de')

    expect(input.value).toBe('user@xn--mller-kva.de')
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
