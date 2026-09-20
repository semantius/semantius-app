import { format, parseISO } from 'date-fns'
import { DatePicker } from '@/components/ui-ext/date-picker'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy } from './fieldAria'

export function InputDate({
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
  
  return (
    <form.Field name={name} validators={validators}>
      {(field: any) => {
        // Handle hidden and readonly with hidden input
        if (hidden || readonly) {
          const hiddenInput = <input type="hidden" name={name} value={field.state.value || ''} />
          if (hidden) return hiddenInput
        }
        
        // A calendar date has no time zone, and the Date constructor gives it
        // one: `new Date('2024-03-15')` is UTC midnight, which `toISOString()`
        // then reads back as the 14th anywhere west of Greenwich. `parseISO`
        // builds a LOCAL midnight and `format` reads the local parts, so the
        // day the user picked is the day that is stored.
        const parseDateValue = (val: any): Date | undefined => {
          if (!val) return undefined
          if (typeof val !== 'string') return val
          const date = parseISO(val)
          return Number.isNaN(date.getTime()) ? undefined : date
        }
        
        const dateValue = parseDateValue(field.state.value)

        const handleDateChange = (date: Date | undefined) => {
          // Convert Date to ISO string for form data, only if valid
          if (date && !Number.isNaN(date.getTime())) {
            field.handleChange(format(date, 'yyyy-MM-dd'))
          } else {
            field.handleChange(undefined)
          }
          field.handleBlur()
        }

        return (
          <div className="pt-2 space-y-1">
            <FormLabel htmlFor={name} label={label} description={description} required={required} error={!!field.state.meta.errors?.[0]} />
            <DatePicker
              id={name}
              label={label}
              date={dateValue}
              onDateChange={handleDateChange}
              disabled={disabled || readonly}
              aria-describedby={describedBy(name, { description, error: field.state.meta.errors?.[0], formMode })}
              aria-invalid={!!field.state.meta.errors?.[0]}
            />
            {readonly && <input type="hidden" name={name} value={field.state.value || ''} />}
            <FormDescription name={name} description={description} error={field.state.meta.errors?.[0]} />
            <FormError name={name} error={field.state.meta.errors?.[0]} />
          </div>
        )
      }}
    </form.Field>
  )
}
