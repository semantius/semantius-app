import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputIpv4 } from '../InputIpv4'
import { renderControl } from './harness'

describe('InputIpv4', () => {
  const OCTET = '(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'
  const IPV4 = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}$`)
  const formatValidator = ({ value }: { value: string }) => {
    if (!value) return undefined
    return !IPV4.test(value) ? 'must match format "ipv4"' : undefined
  }

  it('should render ipv4 input', () => {
    const { container } = renderControl(<InputIpv4 name="ipv4" />)
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('placeholder', '192.168.1.1')
  })

  it('is named by its label', () => {
    renderControl(<InputIpv4 name="ipv4" label="Server IP" />)
    expect(screen.getByRole('textbox', { name: 'Server IP' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputIpv4 name="ipv4" label="Server IP" description="Enter the server IPv4 address" />,
    )
    expect(screen.getByRole('textbox', { name: 'Server IP' })).toHaveAccessibleDescription(
      'Enter the server IPv4 address',
    )
  })

  it('should show required indicator when required', () => {
    renderControl(<InputIpv4 name="ipv4" label="IP Address" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should validate required field', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputIpv4
        name="ipv4"
        label="IP Address"
        inputMode="required"
        validators={{
          onBlur: ({ value }) => (!value || value.trim() === '' ? 'must not be empty' : undefined),
        }}
      />,
    )

    const input = screen.getByLabelText(/ip address/i)
    await user.click(input)
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must not be empty/i)).toBeInTheDocument()
    })
  })

  it('should detect invalid IPv4 format', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputIpv4 name="ipv4" label="IP Address" validators={{ onBlur: formatValidator }} />,
    )

    const input = screen.getByLabelText(/ip address/i)
    await user.type(input, '256.1.1.1')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must match format "ipv4"/i)).toBeInTheDocument()
    })
  })

  it('should accept valid IPv4 address', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputIpv4 name="ipv4" label="IP Address" validators={{ onBlur: formatValidator }} />,
    )

    const input = screen.getByLabelText(/ip address/i) as HTMLInputElement
    await user.type(input, '192.168.1.1')
    await user.tab()

    await waitFor(() => {
      expect(screen.queryByText(/must match format "ipv4"/i)).not.toBeInTheDocument()
      expect(input.value).toBe('192.168.1.1')
    })
  })

  it('should display label and description', () => {
    renderControl(
      <InputIpv4 name="ipv4" label="Server IP" description="Enter the server IPv4 address" />,
    )
    expect(screen.getByText('Server IP')).toBeInTheDocument()
    expect(screen.getByText('Enter the server IPv4 address')).toBeInTheDocument()
  })
})
