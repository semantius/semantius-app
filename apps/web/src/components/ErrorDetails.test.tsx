import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorDetails } from './ErrorDetails'
import { disableCollector } from '@/i18n/missing'

describe('ErrorDetails', () => {
  beforeEach(() => {
    disableCollector()
  })

  it('offers the stack of any thrown error behind a Details toggle', async () => {
    const user = userEvent.setup()
    const error = new TypeError('formatter is not a function')
    render(<ErrorDetails error={error} />)

    const button = screen.getByRole('button', { name: /details/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('pre')).toBeNull()

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const pre = document.querySelector('pre')!
    expect(pre.textContent).toContain('TypeError: formatter is not a function')
    // A stack has frames; it is rendered as text, not as an escaped string.
    expect(pre.textContent).toContain('\n')
    expect(pre.textContent).not.toContain('\\n')
  })

  it('shows the server text, the cause and the stack together', async () => {
    const user = userEvent.setup()
    const error = new Error('bogus', { cause: { code: 'PGRST100', status: 400, details: 'the trace' } })
    render(<ErrorDetails error={error} text="the trace" />)

    await user.click(screen.getByRole('button', { name: /details/i }))
    const text = document.querySelector('pre')!.textContent!
    expect(text.indexOf('the trace')).toBeLessThan(text.indexOf('"code": "PGRST100"'))
    expect(text).toContain('"status": 400')
    // `details` is shown as text once, not dumped again inside the JSON.
    expect(text.match(/the trace/g)).toHaveLength(1)
    expect(text).toContain('Error: bogus')
  })

  it('renders nothing for a plain object with nothing to show', () => {
    render(<ErrorDetails error={{ message: 'only a message' }} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
