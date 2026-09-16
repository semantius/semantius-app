import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputUrl } from '../InputUrl'
import { renderControl } from './harness'

describe('InputUrl', () => {
  it('renders a text input with the URL keyboard', () => {
    const { container } = renderControl(<InputUrl name="site" />)
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'url')
  })

  it('is named by its label', () => {
    renderControl(<InputUrl name="site" label="Home page" />)
    expect(screen.getByRole('textbox', { name: 'Home page' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(<InputUrl name="site" label="Home page" description="Include the scheme" />)
    expect(screen.getByRole('textbox', { name: 'Home page' })).toHaveAccessibleDescription(
      'Include the scheme',
    )
  })

  it('shows the required indicator', () => {
    renderControl(<InputUrl name="site" label="Home page" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('offers no link while the field is empty', () => {
    renderControl(<InputUrl name="site" label="Home page" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it.each(['https://example.com/path', 'http://example.com', 'ftp://files.example.com/x'])(
    'offers a link for %s',
    (value) => {
      renderControl(<InputUrl name="site" label="Home page" />, { defaultValues: { site: value } })
      const link = screen.getByRole('link', { name: 'Open Home page in a new tab' })
      expect(link).toHaveAttribute('href', value)
      // A real link, so middle-click and "open in new tab" work and a screen
      // reader announces it as a link — not a button with a click handler.
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    },
  )

  it.each(['not a url', 'example.com', 'javascript:alert(1)', 'data:text/html,<b>x'])(
    'offers no link for %s',
    (value) => {
      renderControl(<InputUrl name="site" label="Home page" />, { defaultValues: { site: value } })
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    },
  )

  it('keeps an IRI intact', async () => {
    const user = userEvent.setup()
    renderControl(<InputUrl name="site" label="Home page" />)
    const input = screen.getByRole('textbox', { name: 'Home page' }) as HTMLInputElement
    await user.type(input, 'https://müller.de/straße')
    expect(input.value).toBe('https://müller.de/straße')
  })

  it('hides the link while disabled', () => {
    renderControl(<InputUrl name="site" label="Home page" inputMode="disabled" />, {
      defaultValues: { site: 'https://example.com' },
    })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('still offers the link in view mode', () => {
    // Readonly is the common case for this control — following the link is the
    // only thing left to do with the field.
    renderControl(<InputUrl name="site" label="Home page" inputMode="readonly" />, {
      defaultValues: { site: 'https://example.com' },
    })
    expect(screen.getByRole('link')).toBeInTheDocument()
  })

  it('submits the value through a hidden input when readonly', () => {
    const { container } = renderControl(<InputUrl name="site" inputMode="readonly" />, {
      defaultValues: { site: 'https://example.com' },
    })
    const hidden = container.querySelector('input[type="hidden"]') as HTMLInputElement
    expect(hidden?.value).toBe('https://example.com')
  })

  it('renders nothing but the hidden input when hidden', () => {
    const { container } = renderControl(<InputUrl name="site" label="Home page" inputMode="hidden" />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(container.querySelector('input[type="hidden"]')).toBeInTheDocument()
  })

  it('round-trips what the user types', async () => {
    const user = userEvent.setup()
    renderControl(<InputUrl name="site" label="Home page" />)
    const input = screen.getByRole('textbox', { name: 'Home page' }) as HTMLInputElement
    await user.type(input, 'https://example.org/a?b=c#d')
    expect(input.value).toBe('https://example.org/a?b=c#d')
  })
})
