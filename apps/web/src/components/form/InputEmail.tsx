import { Input } from '@/components/ui/input'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy } from './fieldAria'

export function InputEmail({
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
      {(field: any) => (
        <>
          {(hidden || readonly) && <input type="hidden" name={name} value={field.state.value || ''} />}
          {!hidden && (
            <div className="pt-2 space-y-1">
              <FormLabel htmlFor={name} label={label} description={description} required={required} error={!!field.state.meta.errors?.[0]} />
              <Input
                id={name}
                name={readonly ? undefined : name}
                // type="text", not type="email": this control serves idn-email as
                // well as email, and the HTML spec's email regex is ASCII-only, so
                // type="email" marks a non-ASCII local part (jörg@müller.de)
                // typeMismatch — which blocks EntityView.tsx's native form={FORM_ID}
                // submit and paints the invalid state. inputMode keeps the email
                // soft keyboard.
                //
                // Chromium ALSO punycodes an IDN domain on genuine editing
                // (user@müller.de becomes user@xn--mller-kva.de, silently). That
                // one is not asserted below: it fires on real editing and on
                // execCommand, never on the value-setter path userEvent drives, so
                // a test for it here would pass under type="email" too. The
                // typeMismatch test is the one that fails if this type changes.
                type="text"
                inputMode="email"
                value={field.state.value || ''}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                disabled={disabled || readonly}
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
