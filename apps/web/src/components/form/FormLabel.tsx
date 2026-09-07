import { Label } from '@/components/ui/label'
import { useT } from '@/i18n'
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
  const t = useT()
  if (!label) return null

  return (
    <Label id={labelId(htmlFor)} htmlFor={htmlFor} className={error ? 'text-destructive' : ''}>
      <span>
        {label}
        {required && (
          <span className="text-destructive">
            {/*
              The asterisk is the sighted affordance; the sr-only word is what a
              screen reader appends to the field's name, so it is a word in the
              reader's language. The separating space is JSX, not part of the
              message: a catalog key that begins with a space is one a translator
              can silently drop, and the accessible name would then read
              "Email(required)".
            */}
            *<span className="sr-only">{' '}{t('(required)')}</span>
          </span>
        )}
      </span>
    </Label>
  )
}
