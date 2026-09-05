import { useFormContext } from './FormContext'
import { errorId } from './fieldAria'

interface FormErrorProps {
  name: string
  error?: string
}

/**
 * Validation message for a single field.
 *
 * `role="alert"` (4.1.3 Status Messages) is what makes the message reach a screen
 * reader at all. Without it the text appears silently: sighted users see red,
 * everyone else gets nothing — and since submit-time validation moves focus to the
 * offending control, the message is announced right where the user lands.
 *
 * The element is mounted only while `error` is set, which is deliberate: an alert
 * region is announced when content is inserted into it, so a permanently-mounted
 * empty node would announce nothing on the transition that matters.
 */
export function FormError({ name, error }: FormErrorProps) {
  const { formMode } = useFormContext()
  if (formMode === 'view' || !error) return null

  return (
    <p
      id={errorId(name)}
      role="alert"
      className="text-[0.8rem] font-medium text-destructive"
    >
      {error}
    </p>
  )
}
