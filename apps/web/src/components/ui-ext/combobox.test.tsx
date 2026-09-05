import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Combobox } from './combobox'

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
})
