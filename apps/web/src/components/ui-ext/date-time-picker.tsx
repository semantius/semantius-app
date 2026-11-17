import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { inputSurfaceClassName } from "@/lib/utils-ext"
import { Button } from "@/components/ui/button"
import { LocalizedCalendar } from "@/components/ui-ext/localized-calendar"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n"
import { useDateFnsLocale } from "@/i18n/dateFnsLocale"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateTimePickerProps {
  date?: Date
  onDateTimeChange?: (date: Date | undefined) => void
  disabled?: boolean
  readOnly?: boolean
  className?: string
  /** Id applied to the date trigger — the control a caller points its label at. */
  id?: string
  /**
   * Id of the field's `<label>`. Unlike DatePicker, the primary control here is a
   * `<button>`, and `<label for>` does not name a button — the association has to
   * come from the control side.
   */
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
  /** Field label text, used to name the time input in context. */
  label?: string
}

export function DateTimePicker({
  date,
  onDateTimeChange,
  disabled = false,
  readOnly = false,
  className,
  id,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  label,
}: DateTimePickerProps) {
  const t = useT()
  const locale = useDateFnsLocale()
  const reactId = React.useId()
  const triggerId = id ?? `${reactId}-date`

  const [timeValue, setTimeValue] = React.useState(
    date ? format(date, "HH:mm") : ""
  )

  React.useEffect(() => {
    if (date) {
      setTimeValue(format(date, "HH:mm"))
    } else {
      setTimeValue("")
    }
  }, [date])

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const newDate = new Date(selectedDate)
      // Keep existing time if we have one
      if (date) {
        newDate.setHours(date.getHours())
        newDate.setMinutes(date.getMinutes())
        newDate.setSeconds(date.getSeconds())
      } else if (timeValue) {
        const [hours, minutes] = timeValue.split(':').map(Number)
        newDate.setHours(hours || 0)
        newDate.setMinutes(minutes || 0)
      }
      onDateTimeChange?.(newDate)
    } else {
      onDateTimeChange?.(undefined)
    }
  }

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTimeValue(value)

    // Parse time in format HH:mm
    const [hours, minutes] = value.split(':').map(Number)
    if (!isNaN(hours) && !isNaN(minutes)) {
      const newDate = date ? new Date(date) : new Date()
      newDate.setHours(hours)
      newDate.setMinutes(minutes)
      newDate.setSeconds(0)
      onDateTimeChange?.(newDate)
    }
  }

  // The date box is as wide as the longest date this language can show, not as
  // wide as the cell: every month of the displayed year is laid into the same
  // grid area as the real label, invisibly, and the widest one sets the width.
  // A width taken from the CURRENT value would make two date-times on one form
  // (Created At over Updated At) differ by however long their month names are,
  // and jump when a date is picked. Measuring the formatted strings is what makes
  // it hold in any language — a `ch` figure is right for one font and one locale.
  const sizerDates = React.useMemo(() => {
    const year = (date ?? new Date()).getFullYear()
    return Array.from({ length: 12 }, (_, month) =>
      format(new Date(year, month, 28), "PPP", { locale })
    )
  }, [date, locale])

  // Date box at its content width, the time box packed beside it; whatever is
  // left of the half-row cell stays empty. `min-w-0` + `truncate` let the date
  // shrink rather than overflow where a cell is narrower than both together.
  return (
    <div className={cn("flex gap-2", className)}>
      <div className="grid min-w-0 gap-2">
        <Popover>
          <PopoverTrigger
            render={
              <Button
                id={triggerId}
                variant="ghost"
                // Self-reference is deliberate and is what ARIA prescribes for a
                // "label + current value" trigger: the field label is announced
                // first, then the button's own contents (the chosen date, or
                // "Select date"). Naming it with the label alone would silence the
                // value; leaving it unnamed is what happened before.
                aria-labelledby={ariaLabelledBy ? `${ariaLabelledBy} ${triggerId}` : undefined}
                aria-describedby={ariaDescribedBy}
                // NOT aria-invalid: it is not supported on role="button" (this
                // trigger opens a calendar, it is not a text field), so the
                // invalid state is carried visually here and announced through
                // the error text referenced by aria-describedby. The time <input>
                // below is a real textbox and does take aria-invalid.
                data-field-surface=""
                className={cn(
                  "max-w-full justify-start text-left font-normal",
                  inputSurfaceClassName,
                  !date && "text-muted-foreground",
                  ariaInvalid && "border-destructive ring-3 ring-destructive/20"
                )}
                disabled={disabled || readOnly}
                tabIndex={readOnly ? -1 : undefined}
                type="button"
              />
            }
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span className="grid min-w-0">
              <span className="truncate [grid-area:1/1]">
                {date ? format(date, "PPP", { locale }) : t("Select date")}
              </span>
              {/* Hidden from the accessibility tree as well as from sight: the
                  trigger names itself from its own content, and twelve dates
                  would be read out after the real one. */}
              {sizerDates.map((text) => (
                <span key={text} aria-hidden="true" className="invisible truncate [grid-area:1/1]">
                  {text}
                </span>
              ))}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <LocalizedCalendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid w-40 shrink-0 gap-2">
        <Input
          type="time"
          value={timeValue}
          onChange={handleTimeChange}
          disabled={disabled}
          readOnly={readOnly}
          // The time half is a separate control with no label of its own; without
          // this it announces as an unnamed time field.
          aria-label={label ? t("{field} time", { field: label }) : t("Time")}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
        />
      </div>
    </div>
  )
}
