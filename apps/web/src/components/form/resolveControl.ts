/**
 * Format resolution: a field's `format` names its control.
 *
 * A missing format is a modeling error and still throws — the backend used to
 * strip `format` for eleven of them, and it no longer does (semantius `b0db26f`),
 * so a blank format is not a normal state.
 *
 * An UNKNOWN format is different: the catalog on this app can lag the platform,
 * and a field the registry has never heard of must still be editable. Those
 * names `console.error` and render as `text`. Missing stays a throw; unknown
 * does not, because refusing the whole form over one new format is how a
 * module with two uncataloged names became an error page.
 *
 * Pure in the return value, and deliberately free of React: it is called from
 * render, but it is also the thing a node test can exercise on its own. The
 * `console.error` for an unknown name lives in `assertSupportedFormats`, not
 * here, so resolution itself has no side effect.
 */

import { appError } from '@/lib/appError'
import { isFormatName } from '@/lib/formats'
import { controls, type FormatEntry } from './controls'

/** Synthetic properties `get_schema` adds for display; never form fields. */
const SYNTHETIC_CTYPES: Record<string, true> = { _label: true, fk_label: true }

interface PropertyLike {
  format?: unknown
  ctype?: unknown
  title?: unknown
}

export function isSyntheticProperty(property: PropertyLike): boolean {
  return typeof property.ctype === 'string' && Object.hasOwn(SYNTHETIC_CTYPES, property.ctype)
}

/**
 * The registry entry for a property, or `undefined` if it has no format.
 *
 * An unrecognized name falls back to `text` so the field still renders. Callers
 * that need to tell "unknown" from "text" go through `isFormatName`.
 */
export function resolveControl(property: PropertyLike): FormatEntry | undefined {
  const { format } = property
  if (typeof format !== 'string' || format === '') return undefined
  if (!isFormatName(format)) return controls.text
  return controls[format]
}

interface Offender {
  field: string
  label: string
  format: string | undefined
}

function propertiesOf(schema: Record<string, unknown>): [string, PropertyLike][] {
  const properties = (schema.properties ?? {}) as Record<string, PropertyLike>
  return Object.entries(properties)
}

function labelOf(field: string, property: PropertyLike): string {
  return typeof property.title === 'string' && property.title ? property.title : field
}

function missingFormatsIn(schema: Record<string, unknown>): Offender[] {
  const offenders: Offender[] = []
  for (const [field, property] of propertiesOf(schema)) {
    if (!property || typeof property !== 'object') continue
    if (isSyntheticProperty(property)) continue
    const { format } = property
    if (typeof format === 'string' && format !== '') continue
    offenders.push({ field, label: labelOf(field, property), format: undefined })
  }
  return offenders
}

function unknownFormatsIn(schema: Record<string, unknown>): Offender[] {
  const offenders: Offender[] = []
  for (const [field, property] of propertiesOf(schema)) {
    if (!property || typeof property !== 'object') continue
    if (isSyntheticProperty(property)) continue
    const { format } = property
    if (typeof format !== 'string' || format === '') continue
    if (isFormatName(format)) continue
    offenders.push({ field, label: labelOf(field, property), format })
  }
  return offenders
}

/**
 * Throws unless every property has a format.
 *
 * Unknown formats are logged (`console.error` of the unsupported-format
 * message, with the name filled in) and then treated as `text` by
 * `resolveControl`. Missing formats still throw: a hidden field is still
 * submitted, a readonly one is still rendered, and there is no name to fall
 * back from. The throw names the FIRST missing field so the message is about
 * one field, and lists all of them in `details` so one pass fixes the model.
 */
export function assertSupportedFormats(schema: Record<string, unknown>): void {
  for (const unknown of unknownFormatsIn(schema)) {
    // Developer log, not a translated UI string: the form still renders, and
    // the name of the format the catalog does not have is the whole point.
    console.error(
      `${unknown.label} (${unknown.field}) has the format "${unknown.format}", which is not supported.`,
    )
  }

  const offenders = missingFormatsIn(schema)
  if (offenders.length === 0) return

  const [first] = offenders
  // `field: ` with a blank format — a parenthetical like "(no format)" would be
  // developer prose in a panel the app deliberately never translates.
  const details = offenders.map((o) => `${o.field}: `).join('\n')

  throw appError({
    message: '{label} ({field}) has no format.',
    values: { label: first.label, field: first.field },
    details,
  })
}
