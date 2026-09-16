import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputPassword } from '../InputPassword'
import { renderControl } from './harness'

describe('InputPassword', () => {
  const field = () => document.getElementById('secret') as HTMLInputElement

  it('starts masked', () => {
    renderControl(<InputPassword name="secret" label="API secret" />)
    expect(field()).toHaveAttribute('type', 'password')
  })

  it('is named by its label', () => {
    renderControl(<InputPassword name="secret" label="API secret" />)
    // A password input has no ARIA role, so it is found by its label rather
    // than by getByRole — there is no 'textbox' for type=password.
    expect(field()).toHaveAccessibleName('API secret')
  })

  it('references its description from aria-describedby', () => {
    renderControl(<InputPassword name="secret" label="API secret" description="Stored encrypted" />)
    expect(field()).toHaveAccessibleDescription('Stored encrypted')
  })

  it('never offers the browser the saved account password', () => {
    // A model field that holds a secret is not the user's own credential;
    // autofill here would put their password into someone else's record.
    renderControl(<InputPassword name="secret" label="API secret" />)
    expect(field()).toHaveAttribute('autocomplete', 'new-password')
    expect(field()).toHaveAttribute('spellcheck', 'false')
  })

  it('reveals and re-masks, keeping one name and reporting state through aria-pressed', async () => {
    const user = userEvent.setup()
    renderControl(<InputPassword name="secret" label="API secret" />)

    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)
    expect(field()).toHaveAttribute('type', 'text')
    // The NAME does not change — a control that renames itself is announced as
    // a different control each press; the state is what aria-pressed carries.
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(toggle)
    expect(field()).toHaveAttribute('type', 'password')
  })

  it('round-trips the value it is given', async () => {
    const user = userEvent.setup()
    renderControl(<InputPassword name="secret" label="API secret" />)
    await user.type(field(), 'p@ssw0rd — mit Umlaut ä')
    expect(field().value).toBe('p@ssw0rd — mit Umlaut ä')
  })

  it('shows the required indicator', () => {
    renderControl(<InputPassword name="secret" label="API secret" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('disables the reveal toggle when the field is readonly', () => {
    renderControl(<InputPassword name="secret" label="API secret" inputMode="readonly" />)
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled()
  })

  it('renders nothing but the hidden input when hidden', () => {
    const { container } = renderControl(
      <InputPassword name="secret" label="API secret" inputMode="hidden" />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.querySelector('input[type="hidden"]')).toBeInTheDocument()
  })
})
