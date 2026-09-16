import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { LocalizedCalendar } from "@/components/ui-ext/localized-calendar"
import { useT } from "@/i18n"
import { useDateFnsLocale } from "@/i18n/dateFnsLocale"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

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

  // An InputGroup rather than an absolutely-positioned button over a padded
  // input: the group is the same surface every other control uses, it sizes the
  // gutter itself instead of a hand-tuned `pr-10`, and the focus ring wraps the
  // field and its button as one thing.
  return (
    <InputGroup className={cn("max-w-[280px]", className)}>
      <InputGroupInput
        id={id}
        value={date ? format(date, "PPP", { locale }) : ""}
        placeholder={placeholder ?? t("Pick a date")}
        disabled={disabled}
        readOnly
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
      />
      <InputGroupAddon align="inline-end">
      <Popover>
        <PopoverTrigger
          render={
            <InputGroupButton
              size="icon-xs"
              disabled={disabled || readOnly}
              type="button"
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
      </InputGroupAddon>
    </InputGroup>
  )
}
