import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Combobox } from './combobox'

/** Distance from the trigger's right border to the chevron's right edge. */
function chevronInset(trigger: HTMLElement): number {
  const chevron = trigger.querySelector('svg')
  if (!chevron) throw new Error('expected a chevron svg inside the trigger')
  return trigger.getBoundingClientRect().right - chevron.getBoundingClientRect().right
}

/**
 * The structural half of this component's accessibility, asserted here because
 * it is invisible on screen: a nested button and a dangling `aria-controls` both
 * render exactly like the correct markup.
 *
 * The same three defects existed in `form/InputEnum.tsx` and
 * `form/api-select.tsx` — all three build a `role="combobox"` trigger the same
 * way — so the assertions are deliberately duplicated per component rather than
 * shared. A regression will reach one of them alone.
 */
describe('Combobox', () => {
  const OPTIONS = ['Alpha', 'Beta', 'Gamma']

  it('renders the clear button OUTSIDE the trigger button', () => {
    // A <button> inside a <button> is invalid HTML and axe `nested-interactive`
    // (serious). It got there because the clear control was one of the
    // PopoverTrigger's children.
    render(<Combobox options={OPTIONS} value="Alpha" showClear id="pick" />)
    const trigger = screen.getByRole('combobox')
    const clear = screen.getByRole('button', { name: /clear selection/i })
    expect(trigger.contains(clear)).toBe(false)
  })

  it('shows no clear button without a value, or when disabled', () => {
    const { rerender } = render(<Combobox options={OPTIONS} showClear id="pick" />)
    expect(screen.queryByRole('button', { name: /clear selection/i })).not.toBeInTheDocument()

    rerender(<Combobox options={OPTIONS} value="Alpha" showClear disabled id="pick" />)
    expect(screen.queryByRole('button', { name: /clear selection/i })).not.toBeInTheDocument()
  })

  it('takes its accessible name from aria-label', () => {
    // The negative assertion above passes on a trigger with NO name at all, and
    // this component USED to have exactly that: `role="combobox"` is not a
    // name-from-content role, so the selected value inside the trigger does not
    // name it, and there was no aria-label/aria-labelledby prop to supply one.
    // Found by writing this assertion; the props were added in response.
    render(<Combobox options={OPTIONS} value="Alpha" showClear id="pick" aria-label="Greek letter" />)
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Greek letter')
  })

  it('takes its accessible name from aria-labelledby', () => {
    render(
      <>
        <span id="pick-label">Greek letter</span>
        <Combobox options={OPTIONS} value="Alpha" id="pick" aria-labelledby="pick-label" />
      </>,
    )
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Greek letter')
  })

  it('points aria-controls at an element that actually exists', async () => {
    // cmdk's Command.List overwrites any id passed to it, so the id this
    // component generated pointed at nothing whenever the popup was open — the
    // exact aria-valid-attr-value failure the attribute was added to avoid.
    const user = userEvent.setup()
    render(<Combobox options={OPTIONS} id="pick" />)

    const trigger = screen.getByRole('combobox')
    expect(trigger).not.toHaveAttribute('aria-controls')

    await user.click(trigger)
    await waitFor(() => {
      const id = trigger.getAttribute('aria-controls')
      expect(id).toBeTruthy()
      expect(document.getElementById(id!)).not.toBeNull()
    })
  })

  it('clears the value through the clear button', async () => {
    const user = userEvent.setup()
    let current = 'Alpha'
    render(
      <Combobox
        options={OPTIONS}
        value={current}
        showClear
        id="pick"
        onValueChange={(v) => {
          current = v
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: /clear selection/i }))
    expect(current).toBe('')
  })

  it('returns focus to the trigger after the clear button is clicked', async () => {
    const user = userEvent.setup()
    render(<Combobox options={OPTIONS} value="Alpha" showClear id="pick" aria-label="Greek letter" />)
    const trigger = screen.getByRole('combobox')
    await user.click(screen.getByRole('button', { name: /clear selection/i }))
    expect(document.activeElement).toBe(trigger)
  })

  it('returns focus to the trigger after the clear button is activated with the keyboard', async () => {
    const user = userEvent.setup()
    render(<Combobox options={OPTIONS} value="Alpha" showClear id="pick" aria-label="Greek letter" />)
    const trigger = screen.getByRole('combobox')
    const clear = screen.getByRole('button', { name: /clear selection/i })
    clear.focus()
    expect(document.activeElement).toBe(clear)
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps the chevron the same distance from the trigger edge whether the field is clearable or not', () => {
    render(
      <div style={{ width: 406 }}>
        <Combobox options={OPTIONS} value="Alpha" showClear id="filled" aria-label="Filled" />
        <Combobox options={OPTIONS} id="empty" aria-label="Empty" />
      </div>,
    )
    const filled = screen.getByRole('combobox', { name: 'Filled' })
    const empty = screen.getByRole('combobox', { name: 'Empty' })
    const filledInset = chevronInset(filled)
    const emptyInset = chevronInset(empty)
    expect(Math.abs(filledInset - emptyInset)).toBeLessThan(1)
    expect(filledInset).toBeGreaterThanOrEqual(11)
    expect(filledInset).toBeLessThanOrEqual(13)
    expect(getComputedStyle(filled).paddingRight).toBe('12px')
    expect(getComputedStyle(empty).paddingRight).toBe('12px')
  })
})
