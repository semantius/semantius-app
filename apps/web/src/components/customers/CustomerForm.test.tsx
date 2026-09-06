import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomerForm } from './CustomerForm'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { AppHarness, bootApp } from '@/test/appHarness'

/**
 * `CustomerForm` inside the app's real providers.
 *
 * WHAT CHANGED AND WHY. The file mocked `@/hooks/useTableMutations` — both
 * hooks, resolving `{ id: 1 }` — for one reason: the component calls them while
 * rendering, and a test with no auth provider could not let it. Nothing in the
 * file ever submitted, so the mock's return value was never used and the entire
 * save path was untested while looking covered.
 *
 * The real hooks need nothing but the harness, and the submit path now runs for
 * real, all the way to the database and back.
 *
 * WHAT THAT TURNED UP. The form's fields (`email`, `phone`, `company`, …) are
 * not the tenant's `customers` columns (`company_name`, `contact_name`, …), so
 * a real save is REJECTED — `PGRST204`, "column \"company\" of relation
 * \"customers\" does not exist". That is a defect in this demo route, not in the
 * test, and it makes the failure path the honest thing to assert here: the
 * message reaches the user and the form stays open with their input intact.
 * Asserting a successful save would mean inventing a schema the tenant does not
 * have — which is what the mock was doing.
 */

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <AppHarness>
      <Sheet open={true}>
        <SheetContent>{children}</SheetContent>
      </Sheet>
    </AppHarness>
  )
}

const CUSTOMER = {
  id: 1,
  email: 'test@example.com',
  phone: '555-0100',
  company: 'Test Corp',
  status: 'active',
  total_orders: 5,
}

describe('CustomerForm', () => {
  beforeEach(async () => {
    await bootApp()
  })

  it('renders the create form with empty fields', () => {
    render(<CustomerForm mode="create" onClose={vi.fn()} />, { wrapper: Wrapper })

    expect(screen.getByText('Create New Customer')).toBeInTheDocument()
    expect(screen.getByLabelText(/Email Address/)).toHaveValue('')
    expect(screen.getByLabelText(/Phone Number/)).toHaveValue('')
    expect(screen.getByLabelText(/Company Name/)).toHaveValue('')
    expect(screen.getByRole('button', { name: /Create Customer/i })).toBeInTheDocument()
  })

  it('renders the edit form with the record’s values', () => {
    render(<CustomerForm customer={CUSTOMER} mode="edit" onClose={vi.fn()} />, { wrapper: Wrapper })

    expect(screen.getByText('Edit Customer')).toBeInTheDocument()
    expect(screen.getByLabelText(/Email Address/)).toHaveValue('test@example.com')
    expect(screen.getByLabelText(/Phone Number/)).toHaveValue('555-0100')
    expect(screen.getByLabelText(/Company Name/)).toHaveValue('Test Corp')
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument()
  })

  it('renders view mode with its own title and description', () => {
    render(<CustomerForm customer={CUSTOMER} mode="view" onClose={vi.fn()} />, { wrapper: Wrapper })

    expect(screen.getByText('Customer Details')).toBeInTheDocument()
    expect(screen.getByText('View customer information.')).toBeInTheDocument()
  })

  it('takes what the user types', async () => {
    const user = userEvent.setup()
    render(<CustomerForm mode="create" onClose={vi.fn()} />, { wrapper: Wrapper })

    const email = screen.getByLabelText(/Email Address/)
    const phone = screen.getByLabelText(/Phone Number/)
    const company = screen.getByLabelText(/Company Name/)

    await user.type(email, 'newuser@example.com')
    await user.type(phone, '555-1234')
    await user.type(company, 'New Company')

    expect(email).toHaveValue('newuser@example.com')
    expect(phone).toHaveValue('555-1234')
    expect(company).toHaveValue('New Company')
  })

  it('closes on cancel while the form is untouched', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CustomerForm mode="create" onClose={onClose} />, { wrapper: Wrapper })

    await user.click(screen.getByRole('button', { name: /Cancel/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the database’s refusal and keeps the form open', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CustomerForm mode="create" onClose={onClose} />, { wrapper: Wrapper })

    await user.type(screen.getByLabelText(/Email Address/), 'newuser@example.com')
    await user.type(screen.getByLabelText(/Company Name/), 'New Company')
    await user.click(screen.getByRole('button', { name: /Create Customer/i }))

    // The message is PostgREST's, rendered by the component's own error line.
    await waitFor(
      () => expect(screen.getByText(/does not exist/)).toBeInTheDocument(),
      { timeout: 20000 },
    )
    // A save that failed must not look like one that worked.
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Email Address/)).toHaveValue('newuser@example.com')
  })
})
