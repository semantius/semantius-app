import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SchemaForm } from '../SchemaForm'
import type { SchemaObject } from 'ajv'

describe('SchemaForm', () => {
  const basicSchema: SchemaObject = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Name',
        inputMode: 'required',
        description: 'Your full name',
      },
      email: {
        type: 'string',
        format: 'email',
        title: 'Email',
        inputMode: 'required',
      },
      age: {
        type: 'integer',
        title: 'Age',
      },
    },
  }

  describe('Rendering', () => {
    it('should render all form fields from schema', () => {
      render(<SchemaForm schema={basicSchema} />)

      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/age/i)).toBeInTheDocument()
    })

    it('should mark required fields with asterisk', () => {
      render(<SchemaForm schema={basicSchema} />)

      // Check that asterisks are present for required fields
      const asterisks = screen.getAllByText('*')
      expect(asterisks.length).toBeGreaterThanOrEqual(2) // At least 2 required fields
    })

    it('should display field descriptions', () => {
      render(<SchemaForm schema={basicSchema} />)

      expect(screen.getByText('Your full name')).toBeInTheDocument()
    })

    it('should render submit and reset buttons', () => {
      render(<SchemaForm schema={basicSchema} />)

      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
    })
  })

  describe('Field-Level Validation (onSubmit)', () => {
    it('should validate required field on submit', async () => {
      const user = userEvent.setup()
      render(<SchemaForm schema={basicSchema} />)

      const nameInput = screen.getByLabelText(/name/i)
      const submitButton = screen.getByRole('button', { name: /submit/i })
      
      // Leave field empty and submit
      await user.click(submitButton)

      await waitFor(() => {
        // Both name and email are empty, so both show "must not be empty"
        const errors = screen.getAllByText(/must not be empty/i)
        expect(errors.length).toBeGreaterThanOrEqual(1)
        expect(nameInput).toHaveAttribute('aria-invalid', 'true')
      })
    })

    it('should validate email format on submit', async () => {
      const user = userEvent.setup()
      render(<SchemaForm schema={basicSchema} />)

      const nameInput = screen.getByLabelText(/name/i)
      const emailInput = screen.getByLabelText(/email/i)
      const submitButton = screen.getByRole('button', { name: /submit/i })
      
      // Fill name (required) and enter clearly invalid email, then submit
      await user.type(nameInput, 'John Doe')
      await user.type(emailInput, 'notanemail')  // No @ symbol - clearly invalid
      await user.click(submitButton)

      await waitFor(() => {
        // Email validation should fail
        expect(screen.getByText(/must match format "email"/i)).toBeInTheDocument()
        expect(emailInput).toHaveAttribute('aria-invalid', 'true')
      }, { timeout: 5000 })
    })

    it('should submit successfully after fixing validation errors', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(<SchemaForm schema={basicSchema} onSubmit={onSubmit} />)

      const nameInput = screen.getByLabelText(/name/i)
      const submitButton = screen.getByRole('button', { name: /submit/i })
      
      // Trigger error by submitting empty form
      await user.click(submitButton)
      await waitFor(() => {
        expect(nameInput).toHaveAttribute('aria-invalid', 'true')
        // Multiple fields empty, so multiple errors
        const errors = screen.getAllByText(/must not be empty/i)
        expect(errors.length).toBeGreaterThanOrEqual(1)
      })

      // Fix the errors. Set values with fireEvent.change (one synchronous event)
      // rather than user.type: the empty submit above scheduled the app's
      // setTimeout(100) "scroll/focus to first error" logic, which under load fires
      // mid-typing and steals focus, dropping characters (name would arrive as "J").
      // fireEvent.change is atomic and immune to that race. It also sidesteps the
      // jsdom + userEvent '@' focus-drift bug on the type="email" input.
      const emailInput = screen.getByLabelText(/email/i)
      fireEvent.change(nameInput, { target: { value: 'John Doe' } })
      fireEvent.change(emailInput, { target: { value: 'john@example.com' } })
      
      // Submit again - should work on first click
      await user.click(submitButton)

      await waitFor(() => {
        // Form should submit successfully
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'John Doe',
            email: 'john@example.com'
          })
        )
      })
    })
  })

  describe('Form-Level Validation (onSubmit)', () => {
    it('should show all validation errors on submit', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(<SchemaForm schema={basicSchema} onSubmit={onSubmit} />)

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      await waitFor(() => {
        // Should show errors for required fields
        expect(screen.getAllByText(/must not be empty/i).length).toBeGreaterThan(0)
      })

      // Should not call onSubmit with invalid data
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('should call onSubmit with valid data', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(<SchemaForm schema={basicSchema} onSubmit={onSubmit} />)

      // Fill in required fields.
      // fireEvent.change is used for the email field to avoid a jsdom + userEvent
      // focus-tracking bug where the '@' character can cause focus to drift when
      // user.type() is called on a type="email" input after typing in another field.
      const nameInput = screen.getByLabelText(/name/i)
      const emailInput = screen.getByLabelText(/email/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'John Doe')
      fireEvent.change(emailInput, { target: { value: 'john@example.com' } })

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'John Doe',
            email: 'john@example.com',
          })
        )
      })
    })
  })

  describe('Default Values', () => {
    it('should generate default values from schema', () => {
      const schemaWithDefaults: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', default: 'Default Name' },
        },
      }

      render(<SchemaForm schema={schemaWithDefaults} />)

      expect(screen.getByDisplayValue('Default Name')).toBeInTheDocument()
    })

    it('should use provided initialValue over schema defaults', () => {
      const schemaWithDefaults: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', default: 'Default Name' },
        },
      }

      render(
        <SchemaForm
          schema={schemaWithDefaults}
          initialValue={{ name: 'Provided Name' }}
        />
      )

      expect(screen.getByDisplayValue('Provided Name')).toBeInTheDocument()
      expect(screen.queryByDisplayValue('Default Name')).not.toBeInTheDocument()
    })
  })

  describe('Control Mapping', () => {
    it('should use EmailInput for email format', () => {
      render(<SchemaForm schema={basicSchema} />)

      const emailInput = screen.getByLabelText(/email/i)
      expect(emailInput).toHaveAttribute('type', 'email')
    })

    it('should use NumberInput for integer type', () => {
      render(<SchemaForm schema={basicSchema} />)

      const ageInput = screen.getByLabelText(/age/i)
      // The integer control is react-number-format based: a TEXT input whose
      // numeric intent is carried by inputMode. precision 0 (integer) => numeric.
      expect(ageInput).toHaveAttribute('type', 'text')
      expect(ageInput).toHaveAttribute('inputmode', 'numeric')
    })

    it('should use TextareaInput for multiline format', () => {
      const schemaWithMultiline: SchemaObject = {
        type: 'object',
        properties: {
          bio: { format: 'multiline', title: 'Bio' },
        },
      }

      render(<SchemaForm schema={schemaWithMultiline} />)

      const textarea = screen.getByLabelText(/bio/i)
      expect(textarea.tagName).toBe('TEXTAREA')
    })

    // `text` is a single-line input — it maps to InputText, same as `string`
    // (see controls.ts). The multiline textarea format is `multiline`, above.
    it('should use a single-line input for text format', () => {
      const schemaWithText: SchemaObject = {
        type: 'object',
        properties: {
          bio: { format: 'text', title: 'Bio' },
        },
      }

      render(<SchemaForm schema={schemaWithText} />)

      const input = screen.getByLabelText(/bio/i)
      expect(input.tagName).toBe('INPUT')
    })
  })

  describe('Reset Functionality', () => {
    it('should reset form to initial values', async () => {
      const user = userEvent.setup()
      render(<SchemaForm schema={basicSchema} />)

      const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement
      
      // Enter value
      await user.type(nameInput, 'John Doe')
      expect(nameInput.value).toBe('John Doe')

      // Reset
      const resetButton = screen.getByRole('button', { name: /reset/i })
      await user.click(resetButton)

      await waitFor(() => {
        expect(nameInput.value).toBe('')
      })
    })
  })

  describe('FormMode Functionality', () => {
    it('should make all fields appear disabled when formMode is view', () => {
      render(<SchemaForm schema={basicSchema} formMode="view" />)

      const nameInput = screen.getByLabelText(/name/i)
      const emailInput = screen.getByLabelText(/email/i)
      const ageInput = screen.getByLabelText(/age/i)

      // Check that all inputs are visually disabled
      expect(nameInput).toBeDisabled()
      expect(emailInput).toBeDisabled()
      expect(ageInput).toBeDisabled()
    })

    it('should include readonly field values when form has field-level readonly', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      
      const schemaWithReadonly: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name', inputMode: 'readonly' },
          email: { type: 'string', format: 'email', title: 'Email' },
        },
      }
      
      const initialData = {
        name: 'John Doe',
        email: 'john@example.com',
      }
      
      const { container } = render(
        <SchemaForm 
          schema={schemaWithReadonly} 
          initialValue={initialData}
          onSubmit={onSubmit}
        />
      )

      // Verify hidden input exists for readonly name field
      const hiddenNameInput = container.querySelector('input[type="hidden"][name="name"]') as HTMLInputElement
      expect(hiddenNameInput).toBeInTheDocument()
      expect(hiddenNameInput?.value).toBe('John Doe')
      
      // Submit the form
      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.clear(screen.getByLabelText(/email/i))
      await user.type(screen.getByLabelText(/email/i), 'updated@example.com')
      await user.click(submitButton)

      // Should include readonly name field value via hidden input
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'John Doe',
            email: 'updated@example.com',
          })
        )
      })
    })

    it('should NOT include disabled field values in form submission', async () => {
      const schemaWithDisabled: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name', inputMode: 'required' },
          email: { type: 'string', format: 'email', title: 'Email', inputMode: 'disabled' },
        },
      }

      const user = userEvent.setup()
      const onSubmit = vi.fn()
      
      const initialData = {
        name: 'John Doe',
        email: 'disabled@example.com',
      }
      
      render(
        <SchemaForm 
          schema={schemaWithDisabled} 
          initialValue={initialData}
          onSubmit={onSubmit}
        />
      )

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Disabled field should NOT have a hidden input (no value in submission)
      const hiddenInputs = document.querySelectorAll('input[type="hidden"][name="email"]')
      expect(hiddenInputs.length).toBe(0)

      // Should include name but disabled email field should follow standard form behavior
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled()
      })
    })

    it('should allow editing when formMode is edit (default)', () => {
      render(<SchemaForm schema={basicSchema} formMode="edit" />)

      const nameInput = screen.getByLabelText(/name/i)
      
      // Should not be disabled
      expect(nameInput).not.toBeDisabled()
    })

    it('should respect field-level readonly even when formMode is edit', () => {
      const schemaWithReadonly: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name', inputMode: 'readonly' },
          email: { type: 'string', format: 'email', title: 'Email' },
        },
      }

      render(<SchemaForm schema={schemaWithReadonly} formMode="edit" />)

      const nameInput = screen.getByLabelText(/name/i)
      const emailInput = screen.getByLabelText(/email/i)

      // Name should appear disabled due to field-level readonly
      expect(nameInput).toBeDisabled()
      // Email should not be disabled
      expect(emailInput).not.toBeDisabled()
    })

    it('should make field readonly when either formMode is view or field inputMode is readonly', () => {
      const schemaWithReadonly: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name', inputMode: 'readonly' },
          email: { type: 'string', format: 'email', title: 'Email' },
        },
      }

      render(<SchemaForm schema={schemaWithReadonly} formMode="view" />)

      const nameInput = screen.getByLabelText(/name/i)
      const emailInput = screen.getByLabelText(/email/i)

      // Both should appear disabled
      expect(nameInput).toBeDisabled()
      expect(emailInput).toBeDisabled()
    })

    it('should have hidden input for readonly fields to include in submission', () => {
      const initialData = { name: 'Test Name' }
      
      render(
        <SchemaForm 
          schema={{ type: 'object', properties: { name: { type: 'string', title: 'Name', inputMode: 'readonly' }}}}
          initialValue={initialData}
        />
      )

      // Should have a hidden input with the value for submission
      const hiddenInput = document.querySelector('input[type="hidden"][name="name"]') as HTMLInputElement
      expect(hiddenInput).toBeInTheDocument()
      expect(hiddenInput.value).toBe('Test Name')
    })

    it('should NOT validate readonly fields on submit (even if they have validation rules)', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      
      const schemaWithReadonlyAndRequired: SchemaObject = {
        type: 'object',
        properties: {
          name: { 
            type: 'string', 
            title: 'Name', 
            inputMode: 'readonly',
            minLength: 5, // Validation rule that would normally fail for empty value
          },
          email: { 
            type: 'string', 
            format: 'email', 
            title: 'Email',
            inputMode: 'required',
          },
        },
      }

      render(
        <SchemaForm 
          schema={schemaWithReadonlyAndRequired} 
          initialValue={{ name: '', email: '' }} // Empty values
          onSubmit={onSubmit}
        />
      )

      // Fill only the non-readonly field
      await user.clear(screen.getByLabelText(/email/i))
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Should submit successfully - readonly field validation should be skipped
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '', // Empty readonly field should be included without validation error
            email: 'test@example.com',
          })
        )
      })
    })

    it('should NOT show validation errors for readonly fields with empty values', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      
      const schemaWithReadonly: SchemaObject = {
        type: 'object',
        properties: {
          requiredReadonly: { 
            type: 'string', 
            title: 'Required Readonly', 
            inputMode: 'readonly',
            minLength: 1, // Would fail for empty string
          },
          normalField: { 
            type: 'string', 
            title: 'Normal Field',
            inputMode: 'required',
          },
        },
      }

      render(
        <SchemaForm 
          schema={schemaWithReadonly} 
          initialValue={{ requiredReadonly: '', normalField: '' }}
          onSubmit={onSubmit}
        />
      )

      // Leave normalField empty, fill it then submit
      await user.type(screen.getByLabelText(/normal field/i), 'test')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Should NOT show validation error for readonly field
      await waitFor(() => {
        expect(screen.queryByText(/minLength/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/must not be empty/i)).not.toBeInTheDocument()
      })

      // Should submit successfully
      expect(onSubmit).toHaveBeenCalled()
    })

    it('should exclude fields with inputMode readonly when formMode is create', () => {
      const schemaWithReadonly: SchemaObject = {
        type: 'object',
        properties: {
          id: { type: 'string', title: 'ID', inputMode: 'readonly' },
          name: { type: 'string', title: 'Name', inputMode: 'required' },
          email: { type: 'string', format: 'email', title: 'Email' },
          status: { type: 'string', title: 'Status', inputMode: 'readonly' },
        },
      }

      render(<SchemaForm schema={schemaWithReadonly} formMode="create" />)

      // Readonly fields should not be rendered
      expect(screen.queryByLabelText(/^ID$/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/^Status$/i)).not.toBeInTheDocument()

      // Non-readonly fields should be rendered
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })

    it('should include readonly fields when formMode is edit', () => {
      const schemaWithReadonly: SchemaObject = {
        type: 'object',
        properties: {
          id: { type: 'string', title: 'ID', inputMode: 'readonly' },
          name: { type: 'string', title: 'Name' },
        },
      }

      render(<SchemaForm schema={schemaWithReadonly} formMode="edit" />)

      // All fields should be rendered in edit mode
      expect(screen.getByLabelText(/^ID$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
      
      // Readonly field should be disabled
      expect(screen.getByLabelText(/^ID$/i)).toBeDisabled()
    })

    it('should hide submit and reset buttons in view mode', () => {
      render(<SchemaForm schema={basicSchema} formMode="view" />)

      // Buttons should not be rendered
      expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
    })

    it('should show submit and reset buttons in edit mode', () => {
      render(<SchemaForm schema={basicSchema} formMode="edit" />)

      // Buttons should be rendered
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
    })

    it('should show submit and reset buttons in create mode', () => {
      render(<SchemaForm schema={basicSchema} formMode="create" />)

      // Buttons should be rendered
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
    })
  })

  describe('Schema-level Required Array', () => {
    it('should include fields from schema.required array even with empty values', async () => {
      const schemaWithRequired: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          email: { type: 'string', format: 'email', title: 'Email' },
        },
        required: ['name'], // Object-level required (no inputMode on property)
      }

      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(<SchemaForm schema={schemaWithRequired} onSubmit={onSubmit} />)

      // Leave name empty but enter email
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Should call onSubmit with empty name (because it's in required array)
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '',
            email: 'test@example.com',
          })
        )
      })
    })

    it('should validate object-level required fields exist even if empty', async () => {
      const schemaWithRequired: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          email: { type: 'string', format: 'email', title: 'Email' },
        },
        required: ['name'], // name must exist in data
      }

      const user = userEvent.setup()
      const onSubmit = vi.fn()
      
      // Initialize with data that has name (empty string is valid)
      render(
        <SchemaForm 
          schema={schemaWithRequired} 
          initialValue={{ name: '', email: '' }}
          onSubmit={onSubmit} 
        />
      )

      // Enter only email
      await user.clear(screen.getByLabelText(/email/i))
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Form should submit successfully because name exists (even though empty)
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled()
      })
    })

    it('should differentiate between inputMode required and schema required', async () => {
      const schema: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name', inputMode: 'required' }, // UI required (non-empty)
          email: { type: 'string', format: 'email', title: 'Email' }, // No UI marker
        },
        required: ['email'], // email must exist in data (but can be empty)
      }

      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(<SchemaForm schema={schema} onSubmit={onSubmit} />)

      // Enter name but leave email empty
      await user.type(screen.getByLabelText(/name/i), 'John Doe')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Should include empty email (schema required) but not fail on it being empty
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'John Doe',
            email: '',
          })
        )
      })
    })

    it('should include optional fields with empty values in submission', async () => {
      // Optional fields (not in required array, no inputMode required) should still be included
      const schema: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name', inputMode: 'required' },
          email: { type: 'string', format: 'email', title: 'Email' }, // Optional
          age: { type: 'integer', title: 'Age' }, // Optional
        },
      }

      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(<SchemaForm schema={schema} onSubmit={onSubmit} />)

      // Fill only required field, leave optional fields empty
      await user.type(screen.getByLabelText(/name/i), 'John Doe')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Should include ALL schema properties, even empty optional ones
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'John Doe',
            email: '',
            age: undefined, // or '' depending on field type
          })
        )
      })
    })

    it('should display schema validation errors in UI', async () => {
      // Create an invalid schema that will fail schema validation
      const invalidSchema: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
        },
        required: 'invalid_format' as any, // Should be array, not string
      }

      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(<SchemaForm schema={invalidSchema} onSubmit={onSubmit} />)

      await user.type(screen.getByLabelText(/name/i), 'John Doe')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Should display schema validation error in UI
      await waitFor(() => {
        expect(screen.getByText(/invalid schema/i)).toBeInTheDocument()
      })

      // Should not call onSubmit
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('should display validation errors for non-existent required fields in UI', async () => {
      // Schema with required field that doesn't exist in properties
      const schema: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name', inputMode: 'required' },
        },
        required: ['name', 'nonExistent'], // 'nonExistent' is not in properties
      }

      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(<SchemaForm schema={schema} onSubmit={onSubmit} />)

      // Fill in name
      await user.type(screen.getByLabelText(/name/i), 'John Doe')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Should display validation error for the missing required field
      await waitFor(() => {
        expect(screen.getByText(/validation error/i)).toBeInTheDocument()
        expect(screen.getByText(/nonExistent/i)).toBeInTheDocument()
        expect(screen.getByText(/must have required property/i)).toBeInTheDocument()
      })

      // Should not call onSubmit
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  describe('Readonly vs Disabled Field Submission', () => {
    it('should submit readonly fields but NOT submit disabled fields', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      
      const schema: SchemaObject = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            title: 'Name',
            inputMode: 'required',
          },
          id: {
            type: 'integer',
            title: 'ID',
            inputMode: 'readonly',
            default: 123,
          },
          created_at: {
            type: 'string',
            title: 'Created At',
            inputMode: 'disabled',
            default: '2025-01-01',
          },
          updated_at: {
            type: 'string',
            title: 'Updated At',
            inputMode: 'disabled',
            default: '2025-01-02',
          },
        },
      }

      const initialValue = {
        name: '',
        id: 123,
        created_at: '2025-01-01',
        updated_at: '2025-01-02',
      }

      render(<SchemaForm schema={schema} initialValue={initialValue} onSubmit={onSubmit} formMode="edit" />)

      const nameInput = screen.getByLabelText(/name/i)
      const submitButton = screen.getByRole('button', { name: /submit/i })

      await user.type(nameInput, 'John Doe')
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled()
      })

      const submittedData = onSubmit.mock.calls[0][0]
      
      // Readonly fields SHOULD be submitted
      expect(submittedData).toHaveProperty('id', 123)

      // Disabled fields should NOT be submitted
      expect(submittedData).not.toHaveProperty('created_at')
      expect(submittedData).not.toHaveProperty('updated_at')
    })

    // Regression: get_schema emits synthetic label companions (ctype '_label' and
    // 'fk_label') as readonly properties. They are computed projections, not real
    // columns, so including them in a PATCH/POST body makes PostgREST reject the
    // whole write with PGRST204 "Could not find the '<col>' column". They must be
    // excluded from the submit payload even though they are 'readonly' (and would
    // otherwise be submitted in edit mode).
    it('should NOT submit synthetic label companion fields (_label / fk_label)', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      const schema: SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name', inputMode: 'required' },
          module_id: { type: 'integer', title: 'Module', inputMode: 'default' },
          // FK label companion — composed label of the referenced row
          module_id_label: {
            type: 'string',
            title: 'Module',
            ctype: 'fk_label',
            inputMode: 'readonly',
            writable: false,
          },
          // Row-level composed label
          _label: {
            type: 'string',
            title: 'Entity',
            ctype: '_label',
            inputMode: 'readonly',
            writable: false,
          },
        },
      }

      render(
        <SchemaForm
          schema={schema}
          initialValue={{ name: '', module_id: 1 }}
          onSubmit={onSubmit}
          formMode="edit"
        />
      )

      await user.type(screen.getByLabelText(/name/i), 'Interview Scorecards')
      await user.click(screen.getByRole('button', { name: /submit/i }))

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled()
      })

      const submittedData = onSubmit.mock.calls[0][0]

      // Real columns are submitted...
      expect(submittedData).toHaveProperty('name', 'Interview Scorecards')
      expect(submittedData).toHaveProperty('module_id', 1)
      // ...but synthetic label companions must never reach the write payload.
      expect(submittedData).not.toHaveProperty('_label')
      expect(submittedData).not.toHaveProperty('module_id_label')

      // They must also not be rendered as phantom form fields. Only the real
      // 'Module' (module_id) field should exist, not a duplicate from the label.
      expect(screen.getAllByLabelText(/^module$/i)).toHaveLength(1)
      expect(screen.queryByLabelText(/^entity$/i)).not.toBeInTheDocument()
    })
  })
})

