import { useFormContext } from './FormContext'
import { errorId } from './fieldAria'
import { useSteadyDuringPress } from './pressHold'

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
 *
 * While a pointer press is in progress, the message drawn is the one from when the
 * press began (`pressHold.ts`): the blur that the press itself causes validates the
 * field, and a line appearing or disappearing then would move the pressed button
 * away from the release. The message updates on the release. Accepted side
 * effect: during the press the control's `aria-describedby` already follows the
 * live error, so it may name this element's id before the element is drawn.
 */
export function FormError({ name, error: liveError }: FormErrorProps) {
  const error = useSteadyDuringPress(liveError)
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
