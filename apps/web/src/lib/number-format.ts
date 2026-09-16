/**
 * Locale-aware number formatting shared by the data grid and the number form control,
 * so a value renders identically in both places.
 *
 * Formatting is driven by the browser locale (when `locale` is omitted) and the
 * sem-schema `precision` keyword (decimal places, 0–4). Keep this the single source of
 * truth for number display — do not re-implement number formatting at call sites.
 */

export interface NumberSeparators {
  /** Thousands/group separator for the locale (e.g. "," for en-US, "." for de-DE). */
  group: string
  /** Decimal separator for the locale (e.g. "." for en-US, "," for de-DE). */
  decimal: string
}

/**
 * Derive the locale's group and decimal separators from Intl. Used to configure
 * react-number-format, which takes the separators as explicit strings rather than a
 * locale. Falls back to en-US-style separators if Intl yields nothing usable.
 */
export function getNumberSeparators(locale?: string): NumberSeparators {
  const parts = new Intl.NumberFormat(locale).formatToParts(11111.1)
  const group = parts.find((p) => p.type === 'group')?.value ?? ','
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.'
  return { group, decimal }
}

type PropertyLike = { type?: string | string[]; precision?: number }

/**
 * Resolve the number of decimal places to show for a field:
 *   - explicit `precision` wins (the sem-schema keyword, 0–4)
 *   - else `integer` type → 0
 *   - else (`number` with no precision) → undefined (free decimals, no padding)
 */
export function resolvePrecision(property: PropertyLike): number | undefined {
  if (typeof property.precision === 'number') return property.precision
  const type = Array.isArray(property.type) ? property.type[0] : property.type
  if (type === 'integer') return 0
  return undefined
}

export interface FormatNumberOptions {
  /** BCP-47 locale; omit to use the browser/runtime default. */
  locale?: string
  /** Whether to apply the thousands group separator. Default true. */
  grouping?: boolean
}

/**
 * Format a numeric value for display in the grid.
 *   - null / undefined / '' → '' (blank, not a misleading '0')
 *   - strings are coerced to a number first (some backends return numeric/decimal columns
 *     as JSON strings to preserve precision)
 *   - non-finite / unparseable → the original value stringified (never corrupt unknown data)
 *   - precision defined → exactly that many fraction digits (rounded + zero-padded)
 *   - precision undefined → up to 20 fraction digits with no padding
 */
export function formatNumberForDisplay(
  value: unknown,
  precision: number | undefined,
  opts: FormatNumberOptions = {},
): string {
  if (value === null || value === undefined || value === '') return ''
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return String(value)
  const { locale, grouping = true } = opts
  return new Intl.NumberFormat(locale, {
    useGrouping: grouping,
    minimumFractionDigits: precision ?? 0,
    maximumFractionDigits: precision ?? 20,
  }).format(num)
}

/**
 * A file size for display: "834 kB", "4,7 MB".
 *
 * `Intl`'s own `unit` style, so the number, the separator and the unit all
 * follow the formatting locale and none of it is a translatable string. The
 * unit is chosen by magnitude against the SI decimal steps `Intl` knows
 * (`byte`, `kilobyte`, `megabyte`), which is what a file manager shows and what
 * the user compares an upload limit against.
 */
export function formatByteSize(bytes: number, locale?: string): string {
  const steps: { unit: 'byte' | 'kilobyte' | 'megabyte'; scale: number }[] = [
    { unit: 'megabyte', scale: 1_000_000 },
    { unit: 'kilobyte', scale: 1_000 },
    { unit: 'byte', scale: 1 },
  ]
  const step = steps.find((s) => Math.abs(bytes) >= s.scale) ?? steps[steps.length - 1]
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: step.unit,
    unitDisplay: 'short',
    maximumFractionDigits: step.scale === 1 ? 0 : 1,
  }).format(bytes / step.scale)
}
