import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputUuid } from '../InputUuid'
import { renderControl } from './harness'

describe('InputUuid', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const formatValidator = ({ value }: { value: string }) => {
    if (!value) return undefined
    return !UUID.test(value) ? 'must match format "uuid"' : undefined
  }

  it('should render uuid input', () => {
    const { container } = renderControl(<InputUuid name="uuid" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('is named by its label', () => {
    renderControl(<InputUuid name="uuid" label="Record ID" />)
    expect(screen.getByRole('textbox', { name: 'Record ID' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(<InputUuid name="uuid" label="Record ID" description="Version 4 UUID" />)
    expect(screen.getByRole('textbox', { name: 'Record ID' })).toHaveAccessibleDescription(
      'Version 4 UUID',
    )
  })

  it('should show required indicator when required', () => {
    renderControl(<InputUuid name="uuid" label="ID" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should validate required field', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputUuid
        name="uuid"
        label="ID"
        inputMode="required"
        validators={{
          onBlur: ({ value }) => (!value || value.trim() === '' ? 'must not be empty' : undefined),
        }}
      />,
    )

    const input = screen.getByLabelText(/id/i)
    await user.click(input)
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must not be empty/i)).toBeInTheDocument()
    })
  })

  it('should detect invalid UUID format', async () => {
    const user = userEvent.setup()
    renderControl(<InputUuid name="uuid" label="ID" validators={{ onBlur: formatValidator }} />)

    const input = screen.getByLabelText(/id/i)
    await user.type(input, 'not-a-uuid')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must match format "uuid"/i)).toBeInTheDocument()
    })
  })

  it('should accept valid UUID', async () => {
    const user = userEvent.setup()
    renderControl(<InputUuid name="uuid" label="ID" validators={{ onBlur: formatValidator }} />)

    const input = screen.getByLabelText(/id/i) as HTMLInputElement
    await user.type(input, '123e4567-e89b-12d3-a456-426614174000')
    await user.tab()

    await waitFor(() => {
      expect(screen.queryByText(/must match format "uuid"/i)).not.toBeInTheDocument()
      expect(input.value).toBe('123e4567-e89b-12d3-a456-426614174000')
    })
  })
})
