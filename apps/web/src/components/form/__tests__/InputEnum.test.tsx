import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputEnum } from '../InputEnum'
import { renderControl } from './harness'

describe('InputEnum', () => {
  const withValue = (option: string) => ({ defaultValues: { option } })

  it('should render combobox trigger', () => {
    renderControl(<InputEnum name="option" />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('should display enum options when opened', async () => {
    const user = userEvent.setup()
    renderControl(<InputEnum name="option" />)

    const trigger = screen.getByRole('combobox')
    await user.click(trigger)

    // Verify popover opened (aria-expanded)
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('should show required indicator when field is required', () => {
    renderControl(<InputEnum name="option" label="Choose Option" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should show clear button for non-required enum field', () => {
    renderControl(<InputEnum name="option" inputMode="default" />, withValue('Option 1'))
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument()
  })

  it('should NOT show clear button for required enum field', () => {
    renderControl(<InputEnum name="option" inputMode="required" />, withValue('Option 1'))
    expect(screen.queryByRole('button', { name: /clear selection/i })).not.toBeInTheDocument()
  })

  it('should validate required field on submit', () => {
    renderControl(
      <InputEnum
        name="option"
        label="Choose Option"
        inputMode="required"
        validators={{
          onSubmit: ({ value }) => (!value || value === '' ? 'must not be empty' : undefined),
        }}
      />,
    )

    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('should display current value in trigger', () => {
    renderControl(<InputEnum name="option" />, withValue('Option 2'))
    expect(screen.getByRole('combobox')).toHaveTextContent('Option 2')
  })

  it('should select an option and update value', async () => {
    const user = userEvent.setup()
    renderControl(<InputEnum name="option" label="Choose Option" inputMode="required" />)

    const trigger = screen.getByRole('combobox')
    // Verify initial state shows placeholder
    expect(trigger).toHaveTextContent('Select an option')

    // Verify the trigger opens on click
    await user.click(trigger)
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('should NOT show error for empty non-required enum field', () => {
    const allowed = ['Option 1', 'Option 2', 'Option 3']
    renderControl(
      <InputEnum
        name="option"
        label="Choose Option"
        inputMode="default"
        validators={{
          onBlur: ({ value }) => {
            if (!value || value === '') return undefined
            return allowed.includes(value) ? undefined : 'must be equal to one of the allowed values'
          },
        }}
      />,
    )

    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.queryByText(/must not be empty/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/must be equal to one of the allowed values/i)).not.toBeInTheDocument()
  })

  it('should clear value when clear button is clicked', async () => {
    const user = userEvent.setup()
    renderControl(<InputEnum name="option" inputMode="default" />, withValue('Option 1'))

    expect(screen.getByRole('combobox')).toHaveTextContent('Option 1')

    await user.click(screen.getByRole('button', { name: /clear selection/i }))

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Select an option')
    })
  })

  /**
   * Regressions from the a11y pass, each of which shipped and had to be undone.
   * They are asserted here rather than left to the browser sweep because all
   * three are structural — visible in the rendered DOM, invisible on screen.
   */
  describe('ARIA wiring', () => {
    it('renders the clear button OUTSIDE the trigger button', () => {
      // A <button> inside a <button> is invalid HTML and axe `nested-interactive`
      // (serious). It got there because the clear control was one of the
      // PopoverTrigger's children.
      renderControl(<InputEnum name="option" label="Choose Option" />, withValue('Option 1'))
      const trigger = screen.getByRole('combobox')
      const clear = screen.getByRole('button', { name: /clear selection/i })
      expect(trigger.contains(clear)).toBe(false)
    })

    it('keeps the clear button out of the trigger accessible name', () => {
      // The trigger self-references in aria-labelledby, so its name is computed
      // from its content — anything nested inside it gets read out as part of
      // the field's name.
      renderControl(<InputEnum name="option" label="Choose Option" />, withValue('Option 1'))
      expect(screen.getByRole('combobox')).not.toHaveAccessibleName(/clear selection/i)
    })

    it('is announced by its label, not just "not by the clear button"', () => {
      // The negative assertion above passes on a trigger with NO name at all.
      // This is the one that fails if the aria-labelledby reference breaks.
      //
      // Only the label half is asserted. The trigger also names itself
      // ("<label id> <own id>") so the current value follows the field name —
      // Chrome's accessibility tree computes "Choose Option Option 1" for this
      // markup (checked over the DevTools protocol) — but dom-accessibility-api,
      // which jest-dom and Testing Library compute names with, treats the
      // self-reference as a cycle and drops it. Asserting the value half here
      // would encode that limitation as the contract.
      renderControl(<InputEnum name="option" label="Choose Option" />, withValue('Option 1'))
      expect(screen.getByRole('combobox')).toHaveAccessibleName(/^Choose Option\b/)
    })

    it('points aria-controls at an element that actually exists', async () => {
      // cmdk's Command.List overwrites any id passed to it, so the id this
      // component generated pointed at nothing whenever the popup was open —
      // the exact aria-valid-attr-value failure the attribute was added to avoid.
      const user = userEvent.setup()
      renderControl(<InputEnum name="option" label="Choose Option" />)
      const trigger = screen.getByRole('combobox')
      expect(trigger).not.toHaveAttribute('aria-controls')

      await user.click(trigger)
      await waitFor(() => {
        const id = trigger.getAttribute('aria-controls')
        expect(id).toBeTruthy()
        expect(document.getElementById(id!)).not.toBeNull()
      })
    })

    it('references its description in edit mode', () => {
      renderControl(<InputEnum name="option" label="Choose Option" description="Pick one" />)
      const trigger = screen.getByRole('combobox')
      const id = trigger.getAttribute('aria-describedby')
      expect(id).toBe('option-description')
      expect(document.getElementById(id!)).not.toBeNull()
      expect(trigger).toHaveAccessibleDescription('Pick one')
    })

    it('omits aria-describedby in view mode, where the description is not rendered', () => {
      // SchemaForm forces readonly in view mode but still renders the control,
      // while FormDescription returns null — so the reference dangled on every
      // read-only record and for every user without edit permission.
      renderControl(
        <InputEnum name="option" label="Choose Option" description="Pick one" inputMode="readonly" />,
        { formMode: 'view' },
      )
      expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-describedby')
      expect(document.getElementById('option-description')).toBeNull()
    })
  })
})
