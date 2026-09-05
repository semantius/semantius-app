import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputHostname } from '../InputHostname'
import { renderControl } from './harness'

describe('InputHostname', () => {
  const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i
  const formatValidator = ({ value }: { value: string }) => {
    if (!value) return undefined
    return !HOSTNAME.test(value) ? 'must match format "hostname"' : undefined
  }

  it('should render hostname input', () => {
    const { container } = renderControl(<InputHostname name="hostname" />)
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('placeholder', 'example.com')
  })

  it('is named by its label', () => {
    renderControl(<InputHostname name="hostname" label="Server Hostname" />)
    expect(screen.getByRole('textbox', { name: 'Server Hostname' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputHostname
        name="hostname"
        label="Server Hostname"
        description="Enter the server hostname"
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Server Hostname' })).toHaveAccessibleDescription(
      'Enter the server hostname',
    )
  })

  it('should show required indicator when required', () => {
    renderControl(<InputHostname name="hostname" label="Hostname" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should validate required field', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputHostname
        name="hostname"
        label="Hostname"
        inputMode="required"
        validators={{
          onBlur: ({ value }) => (!value || value.trim() === '' ? 'must not be empty' : undefined),
        }}
      />,
    )

    const input = screen.getByLabelText(/hostname/i)
    await user.click(input)
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must not be empty/i)).toBeInTheDocument()
    })
  })

  it('should detect invalid hostname format', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputHostname name="hostname" label="Hostname" validators={{ onBlur: formatValidator }} />,
    )

    const input = screen.getByLabelText(/hostname/i)
    await user.type(input, 'invalid..hostname')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must match format "hostname"/i)).toBeInTheDocument()
    })
  })

  it('should accept valid hostname', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputHostname name="hostname" label="Hostname" validators={{ onBlur: formatValidator }} />,
    )

    const input = screen.getByLabelText(/hostname/i) as HTMLInputElement
    await user.type(input, 'example.com')
    await user.tab()

    await waitFor(() => {
      expect(screen.queryByText(/must match format "hostname"/i)).not.toBeInTheDocument()
      expect(input.value).toBe('example.com')
    })
  })

  it('should display label and description', () => {
    renderControl(
      <InputHostname
        name="hostname"
        label="Server Hostname"
        description="Enter the server hostname"
      />,
    )
    expect(screen.getByText('Server Hostname')).toBeInTheDocument()
    expect(screen.getByText('Enter the server hostname')).toBeInTheDocument()
  })
})
