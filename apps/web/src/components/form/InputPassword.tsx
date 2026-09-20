import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { useT } from '@/i18n'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy } from './fieldAria'

export function InputPassword({
  name,
  label,
  description,
  inputMode = 'default',
  validators,
}: FormControlProps) {
  const { form, formMode } = useFormContext()
  const t = useT()
  const [revealed, setRevealed] = useState(false)

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
                <InputGroup>
                  <InputGroupInput
                    id={name}
                    name={readonly ? undefined : name}
                    type={revealed ? 'text' : 'password'}
                    // A model field that happens to hold a secret is never the
                    // browser's saved account password: offering to fill it would
                    // put the user's own credentials into someone else's record.
                    autoComplete="new-password"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    value={field.state.value || ''}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    disabled={disabled || readonly}
                    aria-invalid={!!error}
                    aria-describedby={describedBy(name, { description, error, formMode })}
                  />
                  <InputGroupAddon align="inline-end">
                    {/* One constant name plus aria-pressed, never a name that
                        flips between "Show" and "Hide": a toggle that renames
                        itself is announced as a different control each press, and
                        the pressed state is what carries "it is showing now". */}
                    <InputGroupButton
                      size="icon-xs"
                      aria-label={t('Show password')}
                      aria-pressed={revealed}
                      aria-controls={name}
                      disabled={disabled || readonly}
                      onClick={() => setRevealed((v) => !v)}
                    >
                      {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
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
