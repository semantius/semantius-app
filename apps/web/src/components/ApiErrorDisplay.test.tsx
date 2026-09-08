import { beforeEach, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiErrorDisplay } from './ApiErrorDisplay'
import { appError } from '@/lib/appError'
import { disableCollector } from '@/i18n/missing'

describe('ApiErrorDisplay', () => {
  // The errors below are fixtures — an invented server code, an invented
  // sentence — and a rendered error is a message like any other, so they
  // would be discovered into the shipped index.
  beforeEach(() => {
    disableCollector()
  })

  it('displays error message', () => {
    const error = new Error('Failed to fetch data')
    render(<ApiErrorDisplay error={error} />)

    expect(screen.getByText('Error loading data')).toBeInTheDocument()
    expect(screen.getByText('Failed to fetch data')).toBeInTheDocument()
  })

  it('displays custom title', () => {
    const error = new Error('Network error')
    render(<ApiErrorDisplay error={error} title="Connection failed" />)

    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('renders an app error from its template and values', () => {
    render(<ApiErrorDisplay error={appError({ message: 'Failed to fetch {table} ({status})', values: { table: 'orders', status: 503 } })} />)

    expect(screen.getByText('Failed to fetch orders (503)')).toBeInTheDocument()
  })

  it('shows the hint as text and the rest of the body behind Details', async () => {
    const user = userEvent.setup()
    const error = {
      message: 'API Error',
      hint: 'Check your API key',
      code: 'PGRST301',
    }
    render(<ApiErrorDisplay error={error} />)

    expect(screen.getByText('API Error')).toBeInTheDocument()
    expect(screen.getByText('Check your API key')).toBeInTheDocument()
    const detailsButton = screen.getByRole('button', { name: /details/i })

    // Details should not be visible initially
    expect(screen.queryByText(/"code"/)).not.toBeInTheDocument()

    // Click to expand
    await user.click(detailsButton)
    expect(screen.getByText(/"code"/)).toBeInTheDocument()
    expect(screen.getByText(/PGRST301/)).toBeInTheDocument()

    // Click to collapse
    await user.click(screen.getByRole('button', { name: /details/i }))
    expect(screen.queryByText(/"code"/)).not.toBeInTheDocument()
  })

  it('renders details as text, not as an escaped JSON string', async () => {
    const user = userEvent.setup()
    const error = new Error('bogus', {
      cause: { code: 'PGRST100', details: '0: at line 1, in MapRes:\nbogus.1\n^', status: 400 },
    })
    render(<ApiErrorDisplay error={error} />)

    await user.click(screen.getByRole('button', { name: /details/i }))
    const pre = document.querySelector('pre')!
    expect(pre.textContent).toContain('0: at line 1, in MapRes:\nbogus.1\n^')
    expect(pre.textContent).not.toContain('\\n')
    expect(pre.textContent).toContain('"status": 400')
  })

  it('offers the stack of a thrown error behind Details, even with nothing else to show', async () => {
    const user = userEvent.setup()
    const error = new Error('Simple error')
    render(<ApiErrorDisplay error={error} />)

    await user.click(screen.getByRole('button', { name: /details/i }))
    expect(document.querySelector('pre')!.textContent).toContain('Error: Simple error')
  })

  it('hides the details button for a plain object with nothing beyond its message', () => {
    render(<ApiErrorDisplay error={{ message: 'Simple error' }} />)

    expect(screen.queryByRole('button', { name: /details/i })).not.toBeInTheDocument()
  })
})
