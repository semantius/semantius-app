import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputUri } from '../InputUri'
import { renderControl } from './harness'

describe('InputUri', () => {
  const formatValidator = ({ value }: { value: string }) => {
    if (!value) return undefined
    try {
      new URL(value)
      return undefined
    } catch {
      return 'must match format "uri"'
    }
  }

  it('should render uri input', () => {
    const { container } = renderControl(<InputUri name="uri" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'url')
  })

  it('is named by its label', () => {
    renderControl(<InputUri name="uri" label="Website" />)
    expect(screen.getByRole('textbox', { name: 'Website' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(<InputUri name="uri" label="Website" description="Include the scheme" />)
    expect(screen.getByRole('textbox', { name: 'Website' })).toHaveAccessibleDescription(
      'Include the scheme',
    )
  })

  it('should show required indicator when required', () => {
    renderControl(<InputUri name="uri" label="Website" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should validate required field', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputUri
        name="uri"
        label="Website"
        inputMode="required"
        validators={{
          onBlur: ({ value }) => (!value || value.trim() === '' ? 'must not be empty' : undefined),
        }}
      />,
    )

    const input = screen.getByLabelText(/website/i)
    await user.click(input)
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must not be empty/i)).toBeInTheDocument()
    })
  })

  it('should detect invalid URI format', async () => {
    const user = userEvent.setup()
    renderControl(<InputUri name="uri" label="Website" validators={{ onBlur: formatValidator }} />)

    const input = screen.getByLabelText(/website/i)
    await user.type(input, 'not-a-url')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must match format "uri"/i)).toBeInTheDocument()
    })
  })

  it('should accept valid URI', async () => {
    const user = userEvent.setup()
    renderControl(<InputUri name="uri" label="Website" validators={{ onBlur: formatValidator }} />)

    const input = screen.getByLabelText(/website/i) as HTMLInputElement
    await user.type(input, 'https://example.com/path')
    await user.tab()

    await waitFor(() => {
      expect(screen.queryByText(/must match format "uri"/i)).not.toBeInTheDocument()
      expect(input.value).toBe('https://example.com/path')
    })
  })
})
