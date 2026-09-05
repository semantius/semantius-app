import { useFormContext } from './FormContext'
import { descriptionId } from './fieldAria'

interface FormDescriptionProps {
  /** Field name — the id namespace shared with FormLabel/FormError. */
  name: string
  description?: string
  error?: string
}

/**
 * Help text for a field. Carries `id={name}-description` so the control can
 * point `aria-describedby` at it; `describedBy()` only emits that id when
 * `description` is non-empty, which matches the two ways this renders nothing
 * useful: view mode (returns null) and the `&nbsp;` spacer below.
 *
 * The spacer exists to keep grid rows the same height whether or not a field has
 * help text — it is not content, so it is hidden from assistive tech rather than
 * announced as a blank line.
 */
export function FormDescription({ name, description, error }: FormDescriptionProps) {
  const { formMode } = useFormContext()
  if (formMode === 'view') return null
  if (!description && error) return null

  if (!description) {
    return <p aria-hidden="true" className="text-[0.8rem] text-muted-foreground">{' '}</p>
  }

  return (
    <p id={descriptionId(name)} className="text-[0.8rem] text-muted-foreground">
      {description}
    </p>
  )
}
