import { Label } from '@/components/ui/label'
import { labelId } from './fieldAria'

interface FormLabelProps {
  htmlFor: string
  label?: string
  required?: boolean
  error?: boolean
}

/**
 * The label always carries a stable `id` as well as `htmlFor`, because the two
 * association directions are both needed: `htmlFor` for labelable controls
 * (`<input>`, `<textarea>`, `<select>`), and the id — via `aria-labelledby` — for
 * the controls that are not labelable at all (a `<button>` picker trigger, a
 * CodeMirror content div). Emitting it unconditionally means a control can pick
 * whichever mechanism fits without the label having to know which one it is.
 */
export function FormLabel({ htmlFor, label, required, error }: FormLabelProps) {
  if (!label) return null

  return (
    <Label id={labelId(htmlFor)} htmlFor={htmlFor} className={error ? 'text-destructive' : ''}>
      <span>
        {label}
        {required && (
          <span className="text-destructive">
            *<span className="sr-only"> (required)</span>
          </span>
        )}
      </span>
    </Label>
  )
}
