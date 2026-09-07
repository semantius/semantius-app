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

  return (
    <div className={cn("flex gap-2", className)}>
      <div className="grid gap-2 flex-1">
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
                className={cn(
                  "w-full justify-start text-left font-normal",
                  inputSurfaceClassName,
                  !date && "text-muted-foreground",
                  readOnly && "opacity-60",
                  ariaInvalid && "border-destructive ring-3 ring-destructive/20"
                )}
                disabled={disabled || readOnly}
                tabIndex={readOnly ? -1 : undefined}
                type="button"
              />
            }
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "PPP", { locale }) : <span>{t("Select date")}</span>}
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
      <div className="grid gap-2 max-w-[160px]">
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
