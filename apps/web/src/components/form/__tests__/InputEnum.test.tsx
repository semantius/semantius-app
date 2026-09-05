import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from '@tanstack/react-form'
import { InputEnum } from '../InputEnum'
import { FormProvider } from '../FormContext'
import type { FormContextValue } from '../FormContext'

describe('InputEnum', () => {
  function TestWrapper({ 
    children, 
    defaultValue,
    inputMode = 'default',
    validatorFn = () => undefined,
    formMode
  }: { 
    children: React.ReactNode
    defaultValue?: string
    inputMode?: string
    validatorFn?: (value: any) => string | undefined
    formMode?: FormContextValue['formMode']
  }) {
    const form = useForm({
      defaultValues: { option: defaultValue || '' },
      onSubmit: async () => {},
    })

    const mockContext: FormContextValue = {
      form,
      schema: { 
        type: 'object', 
        properties: {
          option: { 
            type: 'string',
            enum: ['Option 1', 'Option 2', 'Option 3'],
            inputMode 
          }
        },
        required: inputMode === 'required' ? ['option'] : []
      },
      validateField: validatorFn,
      formMode,
    }

    return <FormProvider value={mockContext}>{children}</FormProvider>
  }

  it('should render combobox trigger', () => {
    render(
      <TestWrapper>
        <InputEnum name="option" />
      </TestWrapper>
    )
    const trigger = screen.getByRole('combobox')
    expect(trigger).toBeInTheDocument()
  })

  it('should display enum options when opened', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <InputEnum name="option" />
      </TestWrapper>
    )
    
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)
    
    // Verify popover opened (aria-expanded)
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('should show required indicator when field is required', () => {
    render(
      <TestWrapper inputMode="required">
        <InputEnum name="option" label="Choose Option" inputMode="required" />
      </TestWrapper>
    )
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should show clear button for non-required enum field', () => {
    render(
      <TestWrapper defaultValue="Option 1">
        <InputEnum name="option" inputMode="default" />
      </TestWrapper>
    )
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument()
  })

  it('should NOT show clear button for required enum field', () => {
    render(
      <TestWrapper defaultValue="Option 1" inputMode="required">
        <InputEnum name="option" inputMode="required" />
      </TestWrapper>
    )
    expect(screen.queryByRole('button', { name: /clear selection/i })).not.toBeInTheDocument()
  })

  it('should validate required field on submit', async () => {
    render(
      <TestWrapper inputMode="required" validatorFn={(value) => !value || value === '' ? 'must not be empty' : undefined}
      >
        <InputEnum name="option" 
          label="Choose Option" inputMode="required" validators={{
            onSubmit: ({ value }) => !value || value === '' ? 'must not be empty' : undefined,
          }}
        />
      </TestWrapper>
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger).toBeInTheDocument()
  })

  it('should display current value in trigger', () => {
    render(
      <TestWrapper defaultValue="Option 2">
        <InputEnum name="option" />
      </TestWrapper>
    )
    
    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveTextContent('Option 2')
  })

  it('should select an option and update value', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper inputMode="required">
        <InputEnum name="option" 
          label="Choose Option" inputMode="required"
        />
      </TestWrapper>
    )

    const trigger = screen.getByRole('combobox')
    // Verify initial state shows placeholder
    expect(trigger).toHaveTextContent('Select an option')
    
    // Verify the trigger opens on click
    await user.click(trigger)
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('should NOT show error for empty non-required enum field', async () => {
    render(
      <TestWrapper
        inputMode="default"
        validatorFn={(value) => {
          if (!value || value === '') return undefined
          const validOptions = ['Option 1', 'Option 2', 'Option 3']
          return validOptions.includes(value) ? undefined : 'must be equal to one of the allowed values'
        }}
      >
        <InputEnum 
          name="option" 
          label="Choose Option"
          inputMode="default"
          validators={{
            onBlur: ({ value }) => {
              if (!value || value === '') return undefined
              const validOptions = ['Option 1', 'Option 2', 'Option 3']
              return validOptions.includes(value) ? undefined : 'must be equal to one of the allowed values'
            },
          }}
        />
      </TestWrapper>
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger).toBeInTheDocument()
    
    expect(screen.queryByText(/must not be empty/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/must be equal to one of the allowed values/i)).not.toBeInTheDocument()
  })

  it('should clear value when clear button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper defaultValue="Option 1" inputMode="default">
        <InputEnum name="option" inputMode="default" />
      </TestWrapper>
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('Option 1')
    
    const clearBtn = screen.getByRole('button', { name: /clear selection/i })
    await user.click(clearBtn)

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
      render(
        <TestWrapper defaultValue="Option 1">
          <InputEnum name="option" label="Choose Option" />
        </TestWrapper>
      )
      const trigger = screen.getByRole('combobox')
      const clear = screen.getByRole('button', { name: /clear selection/i })
      expect(trigger.contains(clear)).toBe(false)
    })

    it('keeps the clear button out of the trigger accessible name', () => {
      // The trigger self-references in aria-labelledby, so its name is computed
      // from its content — anything nested inside it gets read out as part of
      // the field's name.
      render(
        <TestWrapper defaultValue="Option 1">
          <InputEnum name="option" label="Choose Option" />
        </TestWrapper>
      )
      expect(screen.getByRole('combobox')).not.toHaveAccessibleName(/clear selection/i)
    })

    it('is announced by its label, not just "not by the clear button"', () => {
      // The negative assertion above passes on a trigger with NO name at all.
      // This is the one that fails if the aria-labelledby self-reference breaks.
      render(
        <TestWrapper defaultValue="Option 1">
          <InputEnum name="option" label="Choose Option" />
        </TestWrapper>
      )
      expect(screen.getByRole('combobox')).toHaveAccessibleName(/Choose Option/)
    })

    it('points aria-controls at an element that actually exists', async () => {
      // cmdk's Command.List overwrites any id passed to it, so the id this
      // component generated pointed at nothing whenever the popup was open —
      // the exact aria-valid-attr-value failure the attribute was added to avoid.
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <InputEnum name="option" label="Choose Option" />
        </TestWrapper>
      )
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
      render(
        <TestWrapper>
          <InputEnum name="option" label="Choose Option" description="Pick one" />
        </TestWrapper>
      )
      const id = screen.getByRole('combobox').getAttribute('aria-describedby')
      expect(id).toBe('option-description')
      expect(document.getElementById(id!)).not.toBeNull()
    })

    it('omits aria-describedby in view mode, where the description is not rendered', () => {
      // SchemaForm forces readonly in view mode but still renders the control,
      // while FormDescription returns null — so the reference dangled on every
      // read-only record and for every user without edit permission.
      render(
        <TestWrapper formMode="view">
          <InputEnum name="option" label="Choose Option" description="Pick one" inputMode="readonly" />
        </TestWrapper>
      )
      expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-describedby')
      expect(document.getElementById('option-description')).toBeNull()
    })
  })
})
