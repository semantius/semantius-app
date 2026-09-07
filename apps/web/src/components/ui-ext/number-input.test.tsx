import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NumberInput } from './number-input'
import { formattingLocale } from '@/i18n'
import { getNumberSeparators } from '@/lib/number-format'

/** Normalize a formatted display string back to a plain "1234.56" using the separators of the
 *  FORMATTING LOCALE — the same source the control now reads, so an assertion does not depend
 *  on the host's own locale matching the activated one. */
function normalize(display: string): string {
  const { group, decimal } = getNumberSeparators(formattingLocale())
  const ungrouped = group ? display.split(group).join('') : display
  return decimal === '.' ? ungrouped : ungrouped.replace(decimal, '.')
}

describe('NumberInput', () => {
  it('reports the parsed numeric value as the user types', async () => {
    const onValueChange = vi.fn()
    render(<NumberInput value={undefined} onValueChange={onValueChange} precision={2} />)
    await userEvent.type(screen.getByRole('textbox'), '2400')
    expect(onValueChange).toHaveBeenLastCalledWith(2400)
  })

  it('groups thousands and pads to precision on the displayed value', () => {
    render(<NumberInput value={2400} onValueChange={vi.fn()} precision={2} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(normalize(input.value)).toBe('2400.00')
  })

  it('emits undefined when the field is cleared', async () => {
    const onValueChange = vi.fn()
    render(<NumberInput value={5} onValueChange={onValueChange} precision={0} />)
    await userEvent.clear(screen.getByRole('textbox'))
    expect(onValueChange).toHaveBeenLastCalledWith(undefined)
  })

  it('renders an integer (precision 0) without a decimal part', () => {
    render(<NumberInput value={1200} onValueChange={vi.fn()} precision={0} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(normalize(input.value)).toBe('1200')
  })
})
