import { NumericFormat } from 'react-number-format'

import { cn } from '@/lib/utils'
import { useFormattingLocale } from '@/i18n'
import { getNumberSeparators } from '@/lib/number-format'

/**
 * Class list mirrored from the shadcn base `ui/input.tsx` (which is CLI-owned and cannot be
 * imported from here). KEEP IN SYNC with that file so the number field renders with the exact
 * same `bg-input/50` filled surface, radius, focus ring and aria-invalid styling as every
 * other text input — field appearance must be driven by the theme token, not the control type.
 *
 * We deliberately do NOT use `customInput={Input}`: the base `Input` is a plain function
 * component that does not forward `ref`, and react-number-format needs the input ref to manage
 * the caret while it reformats on each keystroke (without it the cursor jumps to the end).
 * Letting NumericFormat render its own `<input>` keeps caret handling correct.
 * The `file:*` utilities from the base Input are omitted (a number field is never a file input).
 */
const NUMBER_INPUT_SURFACE =
  'h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-base transition-[color,box-shadow] duration-200 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40'

export interface NumberInputProps {
  /** Current value. Accepts a string too — numeric/decimal columns can arrive as strings. */
  value: number | string | null | undefined
  /** Called with the parsed numeric value, or `undefined` when the field is cleared. */
  onValueChange: (value: number | undefined) => void
  /** Fixed decimal places. `undefined` = free decimals (no padding); `0` = integer. */
  precision?: number
  /** Allow negative values. Default true. */
  allowNegative?: boolean
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  id?: string
  name?: string
  className?: string
  onBlur?: () => void
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/**
 * Locale-aware number input built on react-number-format. Renders with the shared shadcn/Base UI
 * input surface (see `NUMBER_INPUT_SURFACE`) and formats with the formatting locale's thousands and
 * decimal separators + the field's precision, matching how the same value renders in the grid
 * (see `lib/number-format.ts`).
 */
export function NumberInput({
  value,
  onValueChange,
  precision,
  allowNegative = true,
  placeholder,
  disabled,
  readOnly,
  id,
  name,
  className,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: NumberInputProps) {
  // The user's FORMATTING locale, not the browser's and not the catalog
  // language: `getNumberSeparators()` with no argument took whatever the browser
  // was set to, so a German UI on an English browser typed "1,234.56" into a
  // field the grid then rendered as "1.234,56".
  const formattingLocale = useFormattingLocale()
  const { group, decimal } = getNumberSeparators(formattingLocale)
  // NumericFormat requires the thousands separator to differ from the decimal separator;
  // if a locale yields an empty or equal group separator, drop grouping rather than break input.
  const thousandSeparator = group && group !== decimal ? group : undefined

  const numericValue =
    value === '' || value === null || value === undefined
      ? undefined
      : typeof value === 'number'
        ? value
        : Number.isFinite(Number(value))
          ? Number(value)
          : undefined

  return (
    <NumericFormat
      // Marks this as an input slot so the global 1.4.11 boundary rule in global.css
      // and SchemaForm's view-mode `[&_[data-slot=input]]` flattening both apply here,
      // exactly as they do to the base <Input>.
      data-slot="input"
      id={id}
      name={name}
      value={numericValue}
      onValueChange={(values) => onValueChange(values.floatValue)}
      onBlur={onBlur}
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder}
      thousandSeparator={thousandSeparator}
      decimalSeparator={decimal}
      decimalScale={precision}
      fixedDecimalScale={precision !== undefined}
      allowNegative={allowNegative}
      inputMode={precision === 0 ? 'numeric' : 'decimal'}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedby}
      // Right-align + tabular figures (equal-width digits) so grouped numbers read cleanly
      // and the decimal point stays put — matches the right-aligned numeric grid cells.
      className={cn(NUMBER_INPUT_SURFACE, 'text-right tabular-nums', className)}
    />
  )
}
