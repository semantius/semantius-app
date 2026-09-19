import { ExternalLink } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { inputGroupIconButtonClassName } from '@/lib/utils-ext'
import { useT } from '@/i18n'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy } from './fieldAria'

/** Schemes worth offering a link for. `URL.canParse` also accepts `javascript:`
 *  and `data:`, which must never become an href the user can click. */
const LINKABLE_PROTOCOLS = new Set(['http:', 'https:', 'ftp:'])

function linkTarget(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  if (!URL.canParse(value)) return undefined
  return LINKABLE_PROTOCOLS.has(new URL(value).protocol) ? value : undefined
}

export function InputUrl({
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
        const href = linkTarget(field.state.value)
        return (
          <>
            {(hidden || readonly) && (
              <input type="hidden" name={name} value={field.state.value || ''} />
            )}
            {!hidden && (
              <div className="pt-2 space-y-1">
                <FormLabel htmlFor={name} label={label} required={required} error={!!error} />
                <InputGroup>
                  <InputGroupInput
                    id={name}
                    name={readonly ? undefined : name}
                    // Not `type="url"`: native constraint validation would run
                    // alongside sem-schema's, and a natively :invalid field blocks
                    // EntityView.tsx's native `form={FORM_ID}` submit with a browser
                    // bubble instead of the app's own error. `inputMode` still
                    // gives the URL soft keyboard.
                    type="text"
                    inputMode="url"
                    value={field.state.value || ''}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    disabled={disabled || readonly}
                    aria-invalid={!!error}
                    aria-describedby={describedBy(name, { description, error, formMode })}
                  />
                  {href && !disabled && (
                    <InputGroupAddon align="inline-end">
                      {/* A real <a>, not a button with an onClick: that is what a
                          screen reader announces as a link, what middle-click and
                          "open in new tab" work on, and what a test can read off
                          the DOM. The addon focuses the input on click, so the
                          link has to stop the event reaching it. */}
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t('Open {field} in a new tab', { field: label ?? name })}
                        className={cn(
                          buttonVariants({ variant: 'ghost' }),
                          inputGroupIconButtonClassName,
                        )}
                      >
                        <ExternalLink aria-hidden="true" />
                      </a>
                    </InputGroupAddon>
                  )}
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
