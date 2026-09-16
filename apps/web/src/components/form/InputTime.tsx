import { Input } from '@/components/ui/input'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy } from './fieldAria'

/**
 * The app writes a time WITH an offset (`14:30:00Z`).
 *
 * `<input type="time">` neither produces nor accepts one — its value is a bare
 * `HH:mm` or `HH:mm:ss` — so the offset is attached on the way out and stripped
 * on the way in. A stored value that has no offset (everything written before
 * this, and everything Postgres hands back: the column is `TIME`, not
 * `TIMETZ`, so it does not keep one) is normalized on display, which is what
 * makes an untouched field validate instead of failing the moment the form is
 * submitted.
 */
const OFFSET = /(Z|[+-]\d{2}:?\d{2})$/

function displayValue(value: unknown): string {
  if (typeof value !== 'string' || value === '') return ''
  return value.replace(OFFSET, '')
}

function withOffset(value: string): string {
  if (value === '') return ''
  const withSeconds = value.length === 5 ? `${value}:00` : value
  return OFFSET.test(withSeconds) ? withSeconds : `${withSeconds}Z`
}

export function InputTime({
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
                type="time"
                // Seconds, so the value the browser produces is HH:mm:ss and the
                // one below it always has a seconds place to attach the offset to.
                step="1"
                value={displayValue(field.state.value)}
                onChange={(e) => field.handleChange(withOffset(e.target.value))}
                onBlur={field.handleBlur}
                disabled={disabled || readonly}
                className="max-w-[160px]"
                aria-invalid={!!field.state.meta.errors?.[0]}
                aria-describedby={describedBy(name, { description, error: field.state.meta.errors?.[0], formMode })}
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
