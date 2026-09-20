import { useFormContext } from './FormContext'
import { descriptionId, isLongFieldDescription } from './fieldAria'

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
 *
 * Long descriptions stay in this element (visually hidden) even though the
 * sighted copy moves into the label-adjacent popover. Putting the id on the
 * popup instead would dangle `aria-describedby` whenever the popup is closed,
 * which is the `aria-valid-attr-value` failure `describedBy()` exists to prevent.
 */
export function FormDescription({ name, description, error }: FormDescriptionProps) {
  const { formMode } = useFormContext()
  if (formMode === 'view') return null
  if (!description && error) return null

  if (!description) {
    return <p aria-hidden="true" className="text-[0.8rem] text-muted-foreground">{' '}</p>
  }

  const isLong = isLongFieldDescription(description)

  return (
    <p
      id={descriptionId(name)}
      className={isLong ? 'sr-only' : 'text-[0.8rem] text-muted-foreground'}
    >
      {description}
    </p>
  )
}
