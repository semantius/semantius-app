import * as React from 'react'
import type { Modifiers } from 'react-day-picker'

import { Calendar } from '@/components/ui/calendar'
import { useFormattingLocale, useT } from '@/i18n'
import { useDateFnsLocale } from '@/i18n/dateFnsLocale'

/**
 * `<Calendar>` with the formatting locale's date-fns data and translated ARIA
 * labels. Use this everywhere instead of `ui/calendar.tsx` directly.
 *
 * Two things are wrong with the bare registry component in a translated app,
 * and neither can be fixed at a call site by hand:
 *
 * 1. react-day-picker renders month and weekday names from a date-fns LOCALE
 *    OBJECT, not from a tag, and it has no way to fetch one. Without `locale`
 *    every calendar in the app is in English no matter what the user picked.
 * 2. Its accessible names ("Go to the Next Month", "Choose the Year", and the
 *    day button's "Today, …, selected") are English constants inside the
 *    library. They are the only text a screen-reader user gets from a calendar,
 *    so leaving them is not a cosmetic gap — the `labels` prop is the supported
 *    way to replace them, and this is the one place that does it.
 *
 * The day-button label is a whole sentence per case rather than a date with
 * prefixes appended, because "Today" and "selected" sit in different places in
 * different languages and a translator can only place them when the whole
 * sentence is one message.
 *
 * `{...props}` comes last so a call site can still override anything, including
 * `locale`.
 */
export function LocalizedCalendar(props: React.ComponentProps<typeof Calendar>) {
  const t = useT()
  const locale = useDateFnsLocale()
  const formattingLocale = useFormattingLocale()

  const labels = React.useMemo(
    () => {
      // The day cell's visible text is a bare number, so its accessible name is
      // the whole date. `Intl` rather than date-fns' 'PPPP' because it takes the
      // formatting locale as a TAG and needs no locale object — correct from the
      // first render, before the date-fns chunk has landed.
      const fullDate = new Intl.DateTimeFormat(formattingLocale, { dateStyle: 'full' })
      return {
        labelNext: () => t('Go to the next month'),
        labelPrevious: () => t('Go to the previous month'),
        labelMonthDropdown: () => t('Choose the month'),
        labelYearDropdown: () => t('Choose the year'),
        labelDayButton: (date: Date, modifiers: Modifiers) => {
          const day = fullDate.format(date)
          if (modifiers.today && modifiers.selected) return t('Today, {day}, selected', { day })
          if (modifiers.today) return t('Today, {day}', { day })
          if (modifiers.selected) return t('{day}, selected', { day })
          return day
        },
      }
    },
    [t, formattingLocale],
  )

  return <Calendar locale={locale} labels={labels} {...props} />
}
