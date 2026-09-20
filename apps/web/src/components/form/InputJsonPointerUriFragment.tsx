import { Input } from '@/components/ui/input'
import { useT } from '@/i18n'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy } from './fieldAria'

export function InputJsonPointerUriFragment({
  name,
  label,
  description,
  inputMode = 'default',
  validators,
}: FormControlProps) {
  const { form, formMode } = useFormContext()
  const t = useT()

  const required = inputMode === 'required'
  const readonly = inputMode === 'readonly'
  const disabled = inputMode === 'disabled'
  const hidden = inputMode === 'hidden'

  return (
    <form.Field name={name} validators={validators}>
      {(field: any) => {
        const error = field.state.meta.errors?.[0]
        return (
          <>
            {(hidden || readonly) && (
              <input type="hidden" name={name} value={field.state.value || ''} />
            )}
            {!hidden && (
              <div className="pt-2 space-y-1">
                <FormLabel htmlFor={name} label={label} description={description} required={required} error={!!error} />
                <Input
                  id={name}
                  name={readonly ? undefined : name}
                  type="text"
                  value={field.state.value || ''}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  disabled={disabled || readonly}
                  placeholder={t('#/path/to/property')}
                  // The leading `#` and the escapes (`~0`, `~1`, percent-encoding)
                  // are the point of this format, and a proportional face hides
                  // the difference between them.
                  className="font-mono"
                  aria-invalid={!!error}
                  aria-describedby={describedBy(name, { description, error, formMode })}
                />
                <FormDescription name={name} description={description} error={error} />
                <FormError name={name} error={error} />
              </div>
            )}
          </>
        )
      }}
    </form.Field>
  )
}
