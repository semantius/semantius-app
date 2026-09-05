import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '@/components/ErrorBoundary'

// Component that throws an error
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message')
  }
  return <div>No error</div>
}

describe('ErrorBoundary', () => {
  // React logs every caught error, and so does componentDidCatch. A call-through
  // spy (no mockImplementation) leaves console.error doing its real job — it only
  // records that it was called — so the boundary's own logging stays observable
  // instead of being replaced by a stub that swallows it.
  let consoleError: MockInstance<typeof console.error>
  beforeAll(() => {
    consoleError = vi.spyOn(console, 'error')
  })
  afterAll(() => {
    consoleError.mockRestore()
  })

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.getByText('No error')).toBeInTheDocument()
  })

  it('catches errors and displays error UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText(/An unexpected error occurred/i)).toBeInTheDocument()
  })

  it('logs the error it caught', () => {
    consoleError.mockClear()
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(
      consoleError.mock.calls.some((args) => String(args[0]).includes('ErrorBoundary caught an error')),
    ).toBe(true)
  })

  it('displays error details when an error is caught', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    // ErrorBoundary uses ApiErrorDisplay which shows the error message directly
    expect(screen.getByText(/Test error message/)).toBeInTheDocument()
  })

  it('offers a real link home, not a scripted navigation', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    // The old version of this test deleted window.location, replaced it with a
    // plain object, clicked, and asserted that object's `href` — which verified
    // the stub, not the app. In a real browser `Location` cannot be replaced at
    // all. What is ours to test is that the control is a link to `/`; following
    // it is the browser's job.
    const home = screen.getByRole('link', { name: /return to home/i })
    expect(home).toHaveAttribute('href', '/')
  })
})
