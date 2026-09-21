import { useRef } from 'react'
import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useT } from '@/i18n'
import { useFormContext } from './FormContext'
import { useCollapsesFieldDescription } from './fieldDescriptionLayout'
import { labelId } from './fieldAria'

/**
 * Time to travel the 8px gap from the icon onto the popup. WCAG 1.4.13 requires
 * hover-opened content to stay while the pointer moves onto it; Base UI's
 * default closeDelay is 0.
 */
const HINT_HOVER_CLOSE_MS = 200

/** Keyboard activation synthesizes click with detail 0; a pointer click is 1+. */
function isPointerGeneratedClick(event: Event): boolean {
  return 'detail' in event && (event as { detail: number }).detail !== 0
}

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
 * Descriptions that would wrap under the control (more than six words, or a
 * one-line width greater than the live field column) render a help-circle
 * button as a SIBLING of the `<label>`, never inside it: a button inside a
 * label would both toggle the popover and activate the control. The popover is
 * visual only; `aria-describedby` still points at FormDescription, which stays
 * mounted so a screen reader hears the text on control focus whether or not
 * the popup is open. Mouse users also get hover-to-open; keyboard and touch
 * still use the button (Enter / Space / tap). A pointer click on a hover-opened
 * hint is ignored so it cannot toggle closed and immediately reopen.
 */
export function FormLabel({ htmlFor, label, description, required, error }: FormLabelProps) {
  const t = useT()
  const { formMode } = useFormContext()
  const hostRef = useRef<HTMLDivElement>(null)
  const collapse = useCollapsesFieldDescription(description, hostRef)
  const showHint = formMode !== 'view' && collapse && !!description

  if (!label && !showHint) return null

  return (
    <div ref={hostRef} className="flex min-h-5 items-center gap-0.5">
      {label && (
        <Label id={labelId(htmlFor)} htmlFor={htmlFor} className={error ? 'w-fit text-destructive' : 'w-fit'}>
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
  const openedByHoverRef = useRef(false)

  return (
    <Popover
      onOpenChange={(nextOpen, eventDetails) => {
        if (nextOpen) {
          openedByHoverRef.current = eventDetails.reason === 'trigger-hover'
          return
        }
        // Pointer click on a hover-opened hint would toggle it closed while the
        // cursor is still on the icon, so hover would reopen it. Keyboard
        // activation (detail 0), Escape, and outside press still dismiss.
        if (
          openedByHoverRef.current &&
          eventDetails.reason === 'trigger-press' &&
          isPointerGeneratedClick(eventDetails.event)
        ) {
          eventDetails.cancel()
          return
        }
        openedByHoverRef.current = false
      }}
    >
      <PopoverTrigger
        openOnHover
        closeDelay={HINT_HOVER_CLOSE_MS}
        render={
          // Translate mode outlines attribute hosts; on a 24px rounded
          // button that is a ring around the glyph. data-icon-button tells
          // the mark to color the icon instead (translateMode.css).
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            data-icon-button=""
            aria-label={t('Extended documentation guide for {label}', { label })}
            className="-ml-1 text-muted-foreground"
          />
        }
      >
        <CircleHelp aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        // Visual-only help, already on the field via aria-describedby. role=dialog
        // would trip ModalInert, make #root inert, and take the trigger out of
        // hit-testing — hover would then close, or the rest of the form would
        // lock until the bubble dismissed.
        role="note"
        data-field-hint=""
        side="bottom"
        align="start"
        sideOffset={8}
        initialFocus={false}
        className="w-auto max-w-72 gap-2 p-3"
      >
        <PopoverDescription className="max-h-60 overflow-y-auto">
          {description}
        </PopoverDescription>
        <PopoverArrow />
      </PopoverContent>
    </Popover>
  )
}
