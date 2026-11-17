/**
 * The values a form starts with: one derivation for every form that seeds from a
 * schema (SchemaForm, and the form playground).
 *
 * The playground once kept its own copy of this, and the copy had drifted: it
 * knew `reference` but not `parent`, seeded `{}` for a `type: 'object'` but
 * nothing at all for the union type `get_schema` emits for a json column, and
 * seeded a date default as its SQL text.
 */
import type { SchemaObject } from 'ajv'
import { formatType, isFormatName } from '@/lib/formats'
import { modelDefault } from '@/lib/modelDefaults'

/**
 * Synthetic, read-only label companions that get_schema emits as properties:
 *   - ctype '_label':   the row's own composed, human-readable label
 *   - ctype 'fk_label': a reference field's composed label (e.g. module_id_label)
 *
 * These are display-only projections (computed columns / functions), NOT real
 * writable columns. They must be excluded from form state, from rendering, and
 * above all from the write payload: PostgREST rejects any INSERT/UPDATE that
 * names them with PGRST204 "Could not find the '<col>' column of '<table>'".
 * Mirrors the same skip in buildPostgRESTSelect and the grid cell renderers
 * (DataTableView/TableView) so all consumers treat these fields consistently.
 */
export function isSyntheticLabelField(propSchema: unknown): boolean {
  const ctype = (propSchema as { ctype?: string } | null)?.ctype
  return ctype === '_label' || ctype === 'fk_label'
}

/**
 * The value a field starts at when the schema gives it no `default`, or a
 * default the browser cannot compute.
 *
 * Derived from the CATALOG's type for the format, not from the property's own
 * `type`. `get_schema` emits the JSON family with a union type array
 * (`["object","array","string","number","integer","boolean","null"]`), and a bare
 * `type === 'object'` comparison never matches an array — such a field fell
 * through to `undefined`, which InputJson renders as a completely BLANK editor.
 * The catalog collapses that union for us.
 *
 * A foreign key starts null, not 0: it is empty, and `undefined` would drop it
 * from form state entirely.
 *
 * An unknown format starts as `''`, the same as `text`, because the control
 * that will edit it is the text control.
 */
export function defaultValueForFormat(format: unknown): unknown {
  if (!isFormatName(format)) {
    return typeof format === 'string' && format !== '' ? '' : undefined
  }
  if (format === 'reference' || format === 'parent') return null
  switch (formatType(format)) {
    case 'boolean':
      return false
    case 'object':
      return {}
    case 'array':
      return []
    case 'string':
      return ''
    // A number field left empty is absent, not 0.
    default:
      return undefined
  }
}

export interface SeededDefaults {
  /** The value each field starts at. A field that starts `undefined` is absent. */
  values: Record<string, unknown>
  /**
   * The fields whose `default` the browser cannot compute (see `modelDefault`).
   * Each starts empty; a create form leaves it out of the INSERT while it stays
   * empty, so the column default applies.
   */
  uncomputed: ReadonlySet<string>
}

/**
 * The starting value of every property of `schema`: its model default where
 * the browser can compute one, the empty value of its format otherwise.
 * Synthetic label companions are not columns and are never seeded. `now` is a
 * parameter so a test can fix the clock.
 */
export function generateDefaultValue(schema: SchemaObject, now: Date = new Date()): SeededDefaults {
  const values: Record<string, unknown> = {}
  const uncomputed = new Set<string>()

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (typeof propSchema !== 'object' || propSchema === null) continue
      if (isSyntheticLabelField(propSchema)) continue

      const format = (propSchema as { format?: unknown }).format
      let value: unknown
      if ('default' in propSchema) {
        const computed = modelDefault((propSchema as { default?: unknown }).default, format, now)
        if (computed) {
          value = computed.value
        } else {
          uncomputed.add(key)
          value = defaultValueForFormat(format)
        }
      } else {
        value = defaultValueForFormat(format)
      }
      // undefined is not seeded: an empty number field is absent.
      if (value !== undefined) values[key] = value
    }
  }

  return { values, uncomputed }
}
