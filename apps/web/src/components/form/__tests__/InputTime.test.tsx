import { describe, it, expect } from 'vitest'
import { InputTime, displayValue, withOffset } from '../InputTime'
import { renderControl } from './harness'

describe('InputTime', () => {
  // `<input type="time">` has no ARIA role, so there is nothing for getByRole
  // to find; locate it by type and assert the COMPUTED name, which is still the
  // point (a label association alone is not).
  const timeInput = (container: HTMLElement) => container.querySelector('input[type="time"]')

  it('should render time input', () => {
    const { container } = renderControl(<InputTime name="time" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'time')
  })

  it('is named by its label', () => {
    const { container } = renderControl(<InputTime name="time" label="Start time" />)
    expect(timeInput(container)).toHaveAccessibleName('Start time')
  })

  it('references its description from aria-describedby', () => {
    const { container } = renderControl(
      <InputTime name="time" label="Start time" description="24-hour clock" />,
    )
    expect(timeInput(container)).toHaveAccessibleDescription('24-hour clock')
  })
})

describe('offset handling', () => {
  const timeInput = () => document.getElementById('start') as HTMLInputElement

  it('asks the browser for seconds, so there is a place to attach the offset', () => {
    renderControl(<InputTime name="start" label="Start" />)
    expect(timeInput()).toHaveAttribute('step', '1')
  })

  it('normalizes a stored value that carries no offset', () => {
    // Everything written before this, and everything Postgres hands back — the
    // column is TIME, not TIMETZ — arrives without one. The input cannot show
    // an offset, so it is stripped for display and re-attached on change.
    renderControl(<InputTime name="start" label="Start" />, {
      defaultValues: { start: '14:30:00' },
    })
    expect(timeInput().value).toBe('14:30:00')
  })

  it('displays a value that already carries one', () => {
    renderControl(<InputTime name="start" label="Start" />, {
      defaultValues: { start: '14:30:00Z' },
    })
    expect(timeInput().value).toBe('14:30:00')
  })

  it.each([
    ['14:30', '14:30:00Z'],
    ['14:30:00', '14:30:00Z'],
    ['09:15:30', '09:15:30Z'],
    ['14:30:00Z', '14:30:00Z'],
    ['14:30:00+01:00', '14:30:00+01:00'],
    ['', ''],
  ])('writes %p as %p', (typed, stored) => {
    // What the <input type="time"> produces is a bare HH:mm or HH:mm:ss; what
    // the app stores carries an offset. An offset already present is kept, so
    // a value from elsewhere is not rewritten to UTC.
    expect(withOffset(typed)).toBe(stored)
  })

  it.each([
    ['14:30:00Z', '14:30:00'],
    ['14:30:00+01:00', '14:30:00'],
    ['14:30:00', '14:30:00'],
    ['', ''],
  ])('displays %p as %p', (stored, shown) => {
    expect(displayValue(stored)).toBe(shown)
  })

  it('treats a non-string stored value as empty', () => {
    expect(displayValue(undefined)).toBe('')
    expect(displayValue(null)).toBe('')
    expect(displayValue(1430)).toBe('')
  })
})
