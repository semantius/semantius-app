import { DateTimePicker } from '@/components/ui-ext/date-time-picker'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy, labelledBy } from './fieldAria'

export function InputDateTime({
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
      {(field: any) => {
        // Convert string to Date if needed, validate the date is valid
        const parseDateValue = (val: any): Date | undefined => {
          if (!val) return undefined
          if (typeof val !== 'string') return val
          const date = new Date(val)
          return Number.isNaN(date.getTime()) ? undefined : date
        }
        
        const dateValue = parseDateValue(field.state.value)

        const handleDateTimeChange = (date: Date | undefined) => {
          // Convert Date to ISO string for form data, only if valid
          if (date && !Number.isNaN(date.getTime())) {
            field.handleChange(date.toISOString())
          } else {
            field.handleChange(undefined)
          }
          field.handleBlur()
        }

        return (
          <div className="pt-2 space-y-1">
            <FormLabel htmlFor={name} label={label} required={required} error={!!field.state.meta.errors?.[0]} />
            <DateTimePicker
              id={name}
              label={label}
              date={dateValue}
              onDateTimeChange={handleDateTimeChange}
              disabled={disabled || readonly}
              aria-labelledby={labelledBy(name, label)}
              aria-describedby={describedBy(name, { description, error: field.state.meta.errors?.[0], formMode })}
              aria-invalid={!!field.state.meta.errors?.[0]}
            />
            <FormDescription name={name} description={description} error={field.state.meta.errors?.[0]} />
            <FormError name={name} error={field.state.meta.errors?.[0]} />
          </div>
        )
      }}
    </form.Field>
  )
}
