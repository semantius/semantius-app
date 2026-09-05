import { Input } from '@/components/ui/input'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy } from './fieldAria'

export function InputRegex({
  name,
  label,
  description,
  inputMode = 'default',
  validators,
  schema,
}: FormControlProps) {
  const { form, formMode } = useFormContext()
  
  
  // Derive props from inputMode
  const required = inputMode === 'required'
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
        <>
          {(hidden || readonly) && <input type="hidden" name={name} value={field.state.value || ''} />}
          {!hidden && (
            <div className="pt-2 space-y-1">
              <FormLabel htmlFor={name} label={label} required={required} error={!!field.state.meta.errors?.[0]} />
              <Input
                id={name}
                name={readonly ? undefined : name}
                type="text"
                value={field.state.value || ''}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                disabled={disabled || readonly}
                placeholder="^[a-zA-Z0-9]+$"
                aria-invalid={!!field.state.meta.errors?.[0]}
                aria-describedby={describedBy(name, { description, error: field.state.meta.errors?.[0], formMode })}
                className="font-mono"
              />
              <FormDescription name={name} description={description} error={field.state.meta.errors?.[0]} />
              <FormError name={name} error={field.state.meta.errors?.[0]} />
            </div>
          )}
        </>
      )}
    </form.Field>
  )
}
