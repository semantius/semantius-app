import { lazy, Suspense } from 'react'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy, labelledBy } from './fieldAria'

// Lazy load CodeMirror
const CodeMirrorEditor = lazy(() => import('./CodeMirrorJsonata'))

export function InputJsonata({
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
        <div className="pt-2 space-y-1">
          <FormLabel htmlFor={name} label={label} required={required} error={!!field.state.meta.errors?.[0]} />
          <div className={`border rounded-md overflow-hidden ${field.state.meta.errors?.[0] ? 'border-destructive' : 'border-input-border'}`}>
            <Suspense fallback={<div className="p-4 text-muted-foreground">Loading editor...</div>}>
              <CodeMirrorEditor
                value={field.state.value || ''}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                disabled={disabled || readonly}
                readOnly={readonly}
                aria-labelledby={labelledBy(name, label)}
                aria-describedby={describedBy(name, { description, error: field.state.meta.errors?.[0], formMode })}
                aria-invalid={!!field.state.meta.errors?.[0]}
              />
            </Suspense>
          </div>
          <FormDescription name={name} description={description} error={field.state.meta.errors?.[0]} />
          <FormError name={name} error={field.state.meta.errors?.[0]} />
        </div>
      )}
    </form.Field>
  )
}
