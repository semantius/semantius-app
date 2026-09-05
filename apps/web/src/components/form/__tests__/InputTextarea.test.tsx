import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputTextarea } from '../InputTextarea'
import { renderControl } from './harness'

describe('InputTextarea', () => {
  it('should render textarea element', () => {
    const { container } = renderControl(<InputTextarea name="text" />)
    expect(container.querySelector('textarea')).toBeTruthy()
  })

  it('is named by its label', () => {
    renderControl(<InputTextarea name="text" label="Biography" />)
    expect(screen.getByRole('textbox', { name: 'Biography' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputTextarea
        name="text"
        label="Biography"
        description="Enter your biography (multi-line text)"
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Biography' })).toHaveAccessibleDescription(
      'Enter your biography (multi-line text)',
    )
  })

  it('should show required indicator when required', () => {
    renderControl(<InputTextarea name="text" label="Description" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should validate required field', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputTextarea
        name="text"
        label="Description"
        inputMode="required"
        validators={{
          onBlur: ({ value }) => (!value || value.trim() === '' ? 'must not be empty' : undefined),
        }}
      />,
    )

    const textarea = screen.getByLabelText(/description/i)
    await user.click(textarea)
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must not be empty/i)).toBeInTheDocument()
    })
  })

  it('should accept valid multi-line text', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputTextarea
        name="text"
        label="Description"
        validators={{
          onBlur: ({ value }) => (!value || value.trim() === '' ? 'must not be empty' : undefined),
        }}
      />,
    )

    const textarea = screen.getByLabelText(/description/i) as HTMLTextAreaElement
    await user.type(textarea, 'Line 1\nLine 2\nLine 3')
    await user.tab()

    await waitFor(() => {
      expect(screen.queryByText(/must not be empty/i)).not.toBeInTheDocument()
      expect(textarea.value).toBe('Line 1\nLine 2\nLine 3')
    })
  })

  it('should display label and description', () => {
    renderControl(
      <InputTextarea
        name="text"
        label="Biography"
        description="Enter your biography (multi-line text)"
      />,
    )
    expect(screen.getByText('Biography')).toBeInTheDocument()
    expect(screen.getByText('Enter your biography (multi-line text)')).toBeInTheDocument()
  })
})
