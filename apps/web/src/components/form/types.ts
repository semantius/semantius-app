/**
 * Input mode determines the interaction state of a form field
 */
export type InputMode = 'default' | 'required' | 'readonly' | 'disabled' | 'hidden'

/**
 * Common interface for all form control components
 * Each control wraps itself with form.Field and manages its own state
 * Form instance is accessed via useFormContext() hook
 */
export interface FormControlProps {
  name: string
  label?: string
  description?: string
  inputMode?: InputMode
  schema?: Record<string, unknown>
  validators?: {
    onChange?: ({ value }: { value: any }) => string | undefined
    onBlur?: ({ value }: { value: any }) => string | undefined
    onSubmit?: ({ value }: { value: any }) => string | undefined
    onDynamic?: ({ value }: { value: any }) => string | undefined
  }
}
