import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputUriReference } from '../InputUriReference'
import { renderControl } from './harness'

describe('InputUriReference', () => {
  it('renders a text input with the URL keyboard', () => {
    const { container } = renderControl(<InputUriReference name="uriRef" />)
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'url')
  })

  // A relative reference is the whole point of this format, and `type="url"`
  // marks every one of these typeMismatch — which is why the type is text. This
  // control serves `iri-reference` too, hence the non-ASCII path.
  it.each(['/straße', '#top', 'https://müller.de/straße'])(
    'accepts the reference %s',
    async (value) => {
      const user = userEvent.setup()
      renderControl(<InputUriReference name="uriRef" label="URI reference" />)

      const input = screen.getByLabelText(/uri reference/i) as HTMLInputElement
      await user.type(input, value)

      expect(input.value).toBe(value)
      expect(input.validity.typeMismatch).toBe(false)
    },
  )

  it('is named by its label', () => {
    renderControl(<InputUriReference name="uriRef" label="URI reference" />)
    expect(screen.getByRole('textbox', { name: 'URI reference' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(
      <InputUriReference name="uriRef" label="URI reference" description="May be relative" />,
    )
    expect(screen.getByRole('textbox', { name: 'URI reference' })).toHaveAccessibleDescription(
      'May be relative',
    )
  })
})
