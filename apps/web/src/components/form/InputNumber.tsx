import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy } from './fieldAria'
import { NumberInput } from '@/components/ui-ext/number-input'
import { resolvePrecision } from '@/lib/number-format'

export function InputNumber({
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

  // `precision` (sem-schema keyword) drives the fixed decimal places; integer type → 0.
  const precision = resolvePrecision({
    type: schema?.type as string | string[] | undefined,
    precision: schema?.precision as number | undefined,
  })

  return (
    <form.Field name={name} validators={validators}>
      {(field: any) => (
        <>
          {(hidden || readonly) && <input type="hidden" name={name} value={field.state.value !== undefined && field.state.value !== null ? field.state.value : ''} />}
          {!hidden && (
            <div className="pt-2 space-y-1">
              <FormLabel htmlFor={name} label={label} required={required} error={!!field.state.meta.errors?.[0]} />
              <NumberInput
                id={name}
                name={readonly ? undefined : name}
                value={field.state.value}
                precision={precision}
                onValueChange={(v) => field.handleChange(v)}
                onBlur={field.handleBlur}
                disabled={disabled || readonly}
                readOnly={readonly}
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
