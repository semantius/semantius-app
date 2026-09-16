/**
 * Strict format resolution: a field's `format` names its control, or the form
 * refuses to render.
 *
 * The old rule was `controls[format || (enum ? 'enum' : type)] || InputText`,
 * which had two silent failure modes. A format the app did not know became a
 * text box — so an `int32` got a free-text editor and an `enum` with a format
 * the registry missed lost its picker. And a field with NO format fell back to
 * its type, which is why the type fallback existed at all: the backend used to
 * strip `format` for eleven of them. It no longer does (semantius `b0db26f`),
 * so a missing format is now a modeling error, not a normal state, and saying
 * so beats rendering the wrong editor over data the user then saves.
 *
 * Pure, and deliberately free of React: it is called from render, but it is
 * also the thing a node test can exercise on its own.
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

/** The registry entry for a property, or `undefined` if its format is unusable. */
export function resolveControl(property: PropertyLike): FormatEntry | undefined {
  const { format } = property
  if (typeof format !== 'string' || format === '') return undefined
  if (!isFormatName(format)) return undefined
  return controls[format]
}

interface Offender {
  field: string
  label: string
  format: string | undefined
}

function offendersIn(schema: Record<string, unknown>): Offender[] {
  const properties = (schema.properties ?? {}) as Record<string, PropertyLike>
  const offenders: Offender[] = []
  for (const [field, property] of Object.entries(properties)) {
    if (!property || typeof property !== 'object') continue
    if (isSyntheticProperty(property)) continue
    if (resolveControl(property)) continue
    offenders.push({
      field,
      label: typeof property.title === 'string' && property.title ? property.title : field,
      format: typeof property.format === 'string' ? property.format : undefined,
    })
  }
  return offenders
}

/**
 * Throws unless every property in the schema resolves to a control.
 *
 * Every inputMode is checked, hidden and readonly included: a hidden field is
 * still submitted, and a readonly one is still rendered. The throw names the
 * FIRST offender so the message is about one field, and lists all of them in
 * `details` so one pass fixes the model instead of one field per reload.
 */
export function assertSupportedFormats(schema: Record<string, unknown>): void {
  const offenders = offendersIn(schema)
  if (offenders.length === 0) return

  const [first] = offenders
  // `field: format`, with the format simply absent when there is none — a
  // parenthetical like "(no format)" would be developer prose in a panel the
  // app deliberately never translates.
  const details = offenders
    .map((o) => `${o.field}: ${o.format ?? ''}`)
    .join('\n')

  if (first.format === undefined) {
    throw appError({
      message: '{label} ({field}) has no format.',
      values: { label: first.label, field: first.field },
      details,
    })
  }
  throw appError({
    message: '{label} ({field}) has the format "{format}", which is not supported.',
    values: { label: first.label, field: first.field, format: first.format },
    details,
  })
}
