import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useT } from '@/i18n'
import { useFormContext } from './FormContext'
import { isLongFieldDescription, labelId } from './fieldAria'

interface FormLabelProps {
  htmlFor: string
  label?: string
  description?: string
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
 *
 * Long descriptions (see `isLongFieldDescription`) render a help-circle button
 * as a SIBLING of the `<label>`, never inside it: a button inside a label would
 * both toggle the popover and activate the control. The popover is visual only;
 * `aria-describedby` still points at FormDescription, which stays mounted so a
 * screen reader hears the text on control focus whether or not the popup is open.
 */
export function FormLabel({ htmlFor, label, description, required, error }: FormLabelProps) {
  const t = useT()
  const { formMode } = useFormContext()
  const showHint = formMode !== 'view' && isLongFieldDescription(description)

  if (!label && !showHint) return null

  return (
    <div className="flex min-h-5 items-center gap-1.5">
      {label && (
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
      )}
      {showHint && description && (
        <FieldHintPopover label={label || htmlFor} description={description} />
      )}
    </div>
  )
}

function FieldHintPopover({ label, description }: { label: string; description: string }) {
  const t = useT()

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('Extended documentation guide for {label}', { label })}
            className="text-muted-foreground"
          />
        }
      >
        <CircleHelp aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={6}
        initialFocus={false}
        className="max-h-60 overflow-y-auto"
      >
        <PopoverDescription>{description}</PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}
