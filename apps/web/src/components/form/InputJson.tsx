import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'

// Lazy load CodeMirror
const CodeMirrorEditor = lazy(() => import('./CodeMirrorJson'))

// Falls back to a plain textarea if CodeMirror/Lezer throws (e.g. tree-cursor
// crash on malformed value). Keeps the field editable instead of taking down
// the whole form.
interface JsonEditorBoundaryProps {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  disabled?: boolean
  readOnly?: boolean
  children: ReactNode
}
class JsonEditorBoundary extends Component<JsonEditorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error) {
    console.error('JSON editor crashed, falling back to textarea:', error)
  }
  render() {
    if (this.state.hasError) {
      const { value, onChange, onBlur, disabled, readOnly } = this.props
      return (
        <textarea
          className="w-full min-h-50 p-2 font-mono text-sm outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          readOnly={readOnly}
        />
      )
    }
    return this.props.children
  }
}

export function InputJson({
  name,
  label,
  description,
  inputMode = 'default',
  validators,
  schema,
}: FormControlProps) {
  const { form } = useFormContext()
  
  // Derive props from inputMode
  const required = inputMode === 'required'
  const readonly = inputMode === 'readonly'
  const disabled = inputMode === 'disabled'
  const hidden = inputMode === 'hidden'
  
  if (hidden) {
    // Hidden fields should render as <input type="hidden"> to be included in form submission
    return (
      <form.Field name={name} validators={validators}>
        {(field: any) => {
          const stringValue = typeof field.state.value === 'string' 
            ? field.state.value 
            : field.state.value 
              ? JSON.stringify(field.state.value) 
              : ''
          return <input type="hidden" name={name} value={stringValue} />
        }}
      </form.Field>
    )
  }
  
  return (
    <form.Field name={name} validators={validators}>
      {(field: any) => {
        // Resolve the field's schema default so an unseeded json field shows valid
        // JSON instead of a BLANK editor. This is the last line of defense: even when
        // form state was never seeded — get_schema emits json columns with a *union*
        // `type` array (["object","array",...]) so a value-less field can slip through
        // generateDefaultValue as undefined, and `shouldReload: false` can keep an
        // older, default-less schema cached for a whole session — the editor must
        // never be empty. get_schema may give the default as a real object/array OR
        // as a JSON string (e.g. "[]"); accept either, else fall back to "{}".
        const schemaDefault = (schema as { default?: unknown } | undefined)?.default
        let defaultString: string
        if (typeof schemaDefault === 'string') {
          defaultString = schemaDefault
        } else if (schemaDefault != null) {
          try {
            defaultString = JSON.stringify(schemaDefault, null, 2)
          } catch {
            defaultString = '{}'
          }
        } else {
          defaultString = '{}'
        }

        // Ensure value is a string (prettify if it's an object). Always coerce
        // the final result so we never hand undefined/null to CodeMirror — its
        // Lezer tree cursor crashes on non-string input.
        let stringValue: string
        if (typeof field.state.value === 'string') {
          stringValue = field.state.value
        } else if (field.state.value == null) {
          stringValue = defaultString
        } else {
          try {
            stringValue = JSON.stringify(field.state.value, null, 2) ?? defaultString
          } catch {
            stringValue = String(field.state.value)
          }
        }

        return (
          <div className="pt-2 space-y-1">
            <FormLabel htmlFor={name} label={label} required={required} error={!!field.state.meta.errors?.[0]} />
            <div className={`border rounded-md overflow-hidden ${field.state.meta.errors?.[0] ? 'border-destructive' : 'border-input'}`}>
              <Suspense fallback={<div className="p-4 text-muted-foreground">Loading editor...</div>}>
                <JsonEditorBoundary
                  value={stringValue}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  disabled={disabled || readonly}
                >
                  <CodeMirrorEditor
                    value={stringValue}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    disabled={disabled || readonly}
                  />
                </JsonEditorBoundary>
              </Suspense>
            </div>
            <FormDescription description={description} error={field.state.meta.errors?.[0]} />
            <FormError name={name} error={field.state.meta.errors?.[0]} />
          </div>
        )
      }}
    </form.Field>
  )
}
