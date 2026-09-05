import { Checkbox } from '@/components/ui/checkbox'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy } from './fieldAria'

export function InputBoolean({
  name,
  label,
  description,
  inputMode = 'default',
  validators,
  schema,
}: FormControlProps) {
  const { form, formMode } = useFormContext()
  
  // Derive props from inputMode
  const readonly = inputMode === 'readonly'
  const disabled = inputMode === 'disabled'
  const hidden = inputMode === 'hidden'
  
  if (hidden) {
    // Hidden fields should render as <input type="hidden"> to be included in form submission
    return (
      <form.Field name={name} validators={validators}>
        {(field: any) => (
          <input type="hidden" name={name} value={field.state.value || ''} />
        )}
      </form.Field>
    )
  }
  
  return (
    <form.Field name={name} validators={validators}>
      {(field: any) => (
        <div className="pt-2 space-y-1">
          <FormLabel htmlFor={name} label={label} required={false} error={!!field.state.meta.errors?.[0]} />
          <div className="flex items-start space-x-2">
            <Checkbox
              id={name}
              name={name}
              checked={field.state.value || false}
              onCheckedChange={field.handleChange}
              onBlur={field.handleBlur}
              disabled={disabled || readonly}
              tabIndex={readonly ? -1 : undefined}
              className={readonly ? 'opacity-60' : ''}
              aria-invalid={!!field.state.meta.errors?.[0]}
              aria-describedby={describedBy(name, { description, error: field.state.meta.errors?.[0], formMode })}
            />
            <FormDescription name={name} description={description} error={field.state.meta.errors?.[0]} />
          </div>
          <FormError name={name} error={field.state.meta.errors?.[0]} />
        </div>
      )}
    </form.Field>
  )
}
