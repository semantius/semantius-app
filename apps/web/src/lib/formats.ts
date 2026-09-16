/**
 * The format catalog.
 *
 * `sem-schema/formats.json` is the ONLY list of format names and their JSON
 * Schema types — the same file the backend derives its `fields.format` enum and
 * column-type mapping from, so a format the app knows is a format the platform
 * knows. Nothing here hand-writes a format name; anything that needs to reason
 * about one imports from this module.
 */
import formats from 'sem-schema/formats.json'

/** Every name in the catalog, as a literal union. */
export type FormatName = keyof typeof formats

/** The JSON Schema types a catalog entry can carry. */
export type JsonSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'

/** The catalog's names, in catalog order. */
export const FORMAT_NAMES = Object.keys(formats) as FormatName[]

export function isFormatName(value: unknown): value is FormatName {
  // `Object.hasOwn`, not `value in formats`: a lookup by `in` walks the
  // prototype, so 'toString' and 'constructor' would both answer true.
  return typeof value === 'string' && Object.hasOwn(formats, value)
}

/**
 * The type a value of this format holds.
 *
 * `json` and `jsonlogic` are declared in the catalog as the union of everything
 * JSON can hold; every consumer here wants a single type to build a default
 * from or to decide whether a field is numeric, so the union collapses to its
 * first non-`null` member (`object` for both). Where the whole union matters,
 * read the catalog entry rather than widening this.
 */
export function formatType(format: FormatName): JsonSchemaType {
  const declared = formats[format].type as JsonSchemaType | JsonSchemaType[]
  if (!Array.isArray(declared)) return declared
  // Falling back to the union's first member rather than naming a type here:
  // the catalog decides what a format holds, and a default spelled in this file
  // would be a second opinion that silently outlives a catalog change.
  return declared.find((t) => t !== 'null') ?? declared[0]
}

/** Whether a format's values are numbers — `integer` and `number` alike. */
export function isNumericFormat(format: FormatName): boolean {
  const type = formatType(format)
  return type === 'integer' || type === 'number'
}
