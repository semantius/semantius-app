import { useRef } from 'react'
import { useFormContext } from './FormContext'
import { descriptionId } from './fieldAria'
import { useSteadyDuringPress } from './pressHold'
import {
  FIELD_DESCRIPTION_CLASS,
  useCollapsesFieldDescription,
} from './fieldDescriptionLayout'

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
 * useful: view mode (returns null) and the spacer below.
 *
 * The spacer exists to keep grid rows the same height whether or not a field has
 * help text — it is not content, so it is hidden from assistive tech rather than
 * announced as a blank line. Every field therefore ends in exactly one line below
 * the control: the visible description, the spacer, or the error, which takes
 * the spacer's place when there is no visible description.
 *
 * Descriptions that would wrap stay in this element (visually hidden) even
 * though the sighted copy moves into the label-adjacent popover. Putting the id
 * on the popup instead would dangle `aria-describedby` whenever the popup is
 * closed, which is the `aria-valid-attr-value` failure `describedBy()` exists
 * to prevent.
 *
 * A collapsed description reserves the spacer line too. `sr-only` takes the text
 * out of the flow, so without it a field with a long description ended one line
 * SHORTER than a field with none, and a row of such fields sat ~20px closer to
 * the next row than every other row in the form.
 */
export function FormDescription({ name, description, error: liveError }: FormDescriptionProps) {
  // The error as FormError draws it: held steady during a press (pressHold.ts),
  // so the description line and the error line change together, on the release.
  const error = useSteadyDuringPress(liveError)
  const { formMode } = useFormContext()
  const hostRef = useRef<HTMLParagraphElement>(null)
  const collapse = useCollapsesFieldDescription(description, hostRef)
  if (formMode === 'view') return null
  if (!description && error) return null

  if (!description) return <DescriptionSpacer />

  // One fragment for both states, so the description element is not remounted
  // when a resize flips `collapse` — `hostRef` stays on the same node.
  return (
    <>
      <p
        ref={hostRef}
        id={descriptionId(name)}
        className={collapse ? 'sr-only' : FIELD_DESCRIPTION_CLASS}
      >
        {description}
      </p>
      {collapse && !error && <DescriptionSpacer />}
    </>
  )
}

/**
 * One empty description line. The content is U+00A0, not a space: a line holding
 * only a collapsible space has no height, and the spacer would reserve nothing.
 */
function DescriptionSpacer() {
  return (
    <p aria-hidden="true" data-description-spacer="" className={FIELD_DESCRIPTION_CLASS}>
      {' '}
    </p>
  )
}
