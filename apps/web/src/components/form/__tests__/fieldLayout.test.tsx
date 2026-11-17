import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputText } from '../InputText'
import { InputDate } from '../InputDate'
import { InputTime } from '../InputTime'
import { InputDateTime } from '../InputDateTime'
import { controls } from '../controls'
import { FormHarness } from './harness'

/**
 * Layout, measured in a real browser with the app's CSS loaded: what these tests
 * pin is the space a field takes, which a class-name assertion cannot see.
 */

const LONG_HINT =
  'This description is deliberately longer than six words so the field collapses it.'

/** Space between the bottom of a field's input and the bottom of the field. */
function spaceBelowInput(input: HTMLElement): number {
  const field = input.closest('.pt-2') as HTMLElement
  return field.getBoundingClientRect().bottom - input.getBoundingClientRect().bottom
}

describe('the line below a field', () => {
  it('is reserved when the description collapsed into the help button, as when there is none', () => {
    render(
      <div style={{ width: 600 }}>
        <FormHarness>
          <InputText name="hinted" label="Hinted" description={LONG_HINT} />
          <InputText name="plain" label="Plain" />
        </FormHarness>
      </div>,
    )
    // The collapse really happened — otherwise this compares two other states.
    expect(screen.getByText(LONG_HINT)).toHaveClass('sr-only')

    const hinted = spaceBelowInput(screen.getByRole('textbox', { name: 'Hinted' }))
    const plain = spaceBelowInput(screen.getByRole('textbox', { name: 'Plain' }))
    // A line of description text, not a margin: before the fix the hinted field
    // ended right under its input and the row below moved up by ~20px.
    expect(plain).toBeGreaterThan(10)
    expect(hinted).toBe(plain)
  })

  it('is taken by the error, not added to it, in both cases', async () => {
    const user = userEvent.setup()
    const invalid = { onChange: () => 'Invalid' }
    render(
      <div style={{ width: 600 }}>
        <FormHarness>
          <InputText name="hinted" label="Hinted" description={LONG_HINT} validators={invalid} />
          <InputText name="plain" label="Plain" validators={invalid} />
        </FormHarness>
      </div>,
    )
    const hintedInput = screen.getByRole('textbox', { name: 'Hinted' })
    const plainInput = screen.getByRole('textbox', { name: 'Plain' })
    await user.type(hintedInput, 'x')
    await user.type(plainInput, 'x')
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))

    expect(spaceBelowInput(hintedInput)).toBe(spaceBelowInput(plainInput))
  })

  it('is hidden from assistive technology', () => {
    render(
      <FormHarness>
        <InputText name="hinted" label="Hinted" description={LONG_HINT} />
      </FormHarness>,
    )
    const spacer = document.querySelector('[data-description-spacer]')
    expect(spacer).toHaveAttribute('aria-hidden', 'true')
    // The description itself still describes the input.
    expect(screen.getByRole('textbox', { name: 'Hinted' })).toHaveAccessibleDescription(LONG_HINT)
  })
})

describe('the label row', () => {
  it('is no taller with the help button, so inputs in one row line up', () => {
    render(
      <FormHarness>
        <div style={{ display: 'grid', gridTemplateColumns: '300px 300px', alignItems: 'start' }}>
          <InputText name="hinted" label="Hinted" description={LONG_HINT} />
          <InputText name="plain" label="Plain" />
        </div>
      </FormHarness>,
    )
    const help = screen.getByRole('button', { name: 'Extended documentation guide for Hinted' })
    const hinted = screen.getByRole('textbox', { name: 'Hinted' }).getBoundingClientRect()
    const plain = screen.getByRole('textbox', { name: 'Plain' }).getBoundingClientRect()
    expect(hinted.top).toBe(plain.top)
    // The fix is a negative margin, not a smaller button: the target stays at
    // the 24px minimum (WCAG 2.5.8).
    const target = help.getBoundingClientRect()
    expect([target.width, target.height]).toEqual([24, 24])
  })
})

describe('date and time widths', () => {
  it('gives a date and a time a quarter of the row, like a number, and a date-time half', () => {
    expect(controls.date.width).toBe('s')
    expect(controls.time.width).toBe('s')
    expect(controls['date-time'].width).toBe('m')
  })

  it('fills the cell with a date field and a time field', () => {
    render(
      <div style={{ width: 400 }}>
        <FormHarness>
          <InputDate name="day" label="Day" />
          <InputTime name="clock" label="Clock" />
        </FormHarness>
      </div>,
    )
    const date = screen.getByRole('textbox', { name: 'Day' }).closest('[data-slot="input-group"]')!
    expect(date.getBoundingClientRect().width).toBe(400)
    expect(screen.getByLabelText('Clock').getBoundingClientRect().width).toBe(400)
  })

  it('sizes the date box of a date-time to the longest date, whatever date it shows', () => {
    render(
      <FormHarness
        defaultValues={{ short: '2024-05-06T12:00:00', long: '2024-09-28T12:00:00' }}
      >
        <div style={{ width: 600 }}>
          <InputDateTime name="short" label="Short" />
        </div>
        <div style={{ width: 600 }}>
          <InputDateTime name="long" label="Long" />
        </div>
      </FormHarness>,
    )
    const short = screen.getByRole('button', { name: /^Short/ }).getBoundingClientRect()
    const long = screen.getByRole('button', { name: /^Long/ }).getBoundingClientRect()
    // "May 6th, 2024" and "September 28th, 2024" share a box width, so a date-time
    // under another lines up with it and the box does not jump when a date is picked.
    expect(short.width).toBe(long.width)
    // Content width, not the cell: the time box is packed beside it and the rest
    // of the 600px stays empty.
    const time = screen.getByLabelText('Long time').getBoundingClientRect()
    expect(time.width).toBe(160)
    expect(time.left - long.right).toBeCloseTo(8, 1)
    expect(time.right - long.left).toBeLessThan(600)
  })
})
