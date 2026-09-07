import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LocalizedCalendar } from "@/components/ui-ext/localized-calendar"
import { useT } from "@/i18n"
import { useDateFnsLocale } from "@/i18n/dateFnsLocale"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface DatePickerProps {
  date?: Date
  onDateChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  className?: string
  /**
   * Id for the displayed value field. This is what a `<label htmlFor>` must point
   * at: the readonly `<Input>` is the only labelable element here (a `<button>` is
   * not named by a `<label for>`), so the id belongs on it rather than on the
   * popover trigger.
   */
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
  /** Field label text, used to name the calendar trigger button in context. */
  label?: string
}

export function DatePicker({
  date,
  onDateChange,
  placeholder,
  disabled = false,
  readOnly = false,
  className,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  label,
}: DatePickerProps) {
  const t = useT()
  // date-fns takes a locale OBJECT, not a tag, so 'PPP' ("April 29th, 2022")
  // stays English until this resolves — see src/i18n/dateFnsLocale.ts.
  const locale = useDateFnsLocale()

  return (
    <div className={cn("relative flex gap-2 max-w-[280px]", className)}>
      <Input
        id={id}
        value={date ? format(date, "PPP", { locale }) : ""}
        placeholder={placeholder ?? t("Pick a date")}
        disabled={disabled}
        readOnly
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className="pr-10"
      />
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              disabled={disabled || readOnly}
              type="button"
              tabIndex={readOnly ? -1 : undefined}
              className={cn(
                "absolute top-1/2 right-2 size-6 -translate-y-1/2",
                readOnly && "opacity-60"
              )}
            />
          }
        >
          <CalendarIcon className="size-3.5" />
          {/* The trigger has no visible text, so this is its entire accessible
              name. Naming the field it belongs to matters once a form has several
              date fields — "Choose date" three times over identifies nothing. */}
          <span className="sr-only">
            {label
              ? t("Choose {field} from calendar", { field: label })
              : t("Choose date from calendar")}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="end" alignOffset={-8} sideOffset={10}>
          <LocalizedCalendar
            mode="single"
            selected={date}
            onSelect={onDateChange}
            captionLayout="dropdown"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
