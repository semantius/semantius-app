/**
 * Drill-down from a ctype `rollup` field to the linked table's filtered grid.
 *
 * `get_schema` puts the aggregation on the property as `rollup.link_field`
 * (`"<table>.<column>"`). The form shows a link next to the (disabled) value
 * that opens that table with a filter on the linked column equal to this row's
 * id — the same URL the grid writes for a select-eq filter.
 */

export interface RollupExpression {
  function?: unknown
  link_field?: unknown
  include_hidden_rows?: unknown
  value_field?: unknown
}

export interface RollupProperty {
  ctype?: unknown
  rollup?: unknown
}

/**
 * The grid's default page size from viewport height. Kept in step with
 * DataTableView: a drill-down URL that omits pageSize gets rewritten on load,
 * and one that uses a different size than the grid would pick looks like a
 * different view.
 */
export function gridPageSizeForHeight(height: number): number {
  if (height > 1330) return 20
  if (height > 1070) return 15
  return 10
}

/** `"interviews.application_id"` → `{ table: "interviews", column: "application_id" }`. */
export function parseRollupLinkField(
  linkField: unknown,
): { table: string; column: string } | undefined {
  if (typeof linkField !== 'string') return undefined
  const dot = linkField.indexOf('.')
  if (dot <= 0 || dot === linkField.length - 1) return undefined
  const table = linkField.slice(0, dot)
  const column = linkField.slice(dot + 1)
  if (table === '' || column === '' || column.includes('.')) return undefined
  return { table, column }
}

export function rollupExpressionOf(property: RollupProperty | undefined): RollupExpression | undefined {
  if (!property || property.ctype !== 'rollup') return undefined
  const rollup = property.rollup
  if (!rollup || typeof rollup !== 'object' || Array.isArray(rollup)) return undefined
  return rollup as RollupExpression
}

/**
 * The linked table, and its plural when `get_schema` children names it.
 * A child's `id` is the same `"<table>.<column>"` as `rollup.link_field`.
 * Applications on the test tenant ship an empty children array, so callers
 * that need a label then load that table's own schema.
 */
export function rollupLinkedEntity(
  property: RollupProperty | undefined,
  children: Array<{ id?: unknown; plural_label?: unknown }> | undefined,
): { table: string; plural: string | undefined } | undefined {
  const expression = rollupExpressionOf(property)
  if (!expression) return undefined
  const linked = parseRollupLinkField(expression.link_field)
  if (!linked) return undefined
  const child = children?.find((entry) => entry.id === expression.link_field)
  const plural =
    typeof child?.plural_label === 'string' && child.plural_label !== ''
      ? child.plural_label
      : undefined
  return { table: linked.table, plural }
}

/**
 * Path + query for the linked grid, or `undefined` when this field cannot
 * drill down (not a rollup, no link_field, no module, no row id).
 *
 * The filter object is the grid's own URL shape: `variant: select` because
 * `link_field` names a foreign key, `operator: eq`, `joinOperator: and`.
 */
export function rollupDrillDownHref({
  property,
  moduleSlug,
  recordId,
  pageSize,
}: {
  property: RollupProperty | undefined
  moduleSlug: string | undefined
  recordId: unknown
  pageSize: number
}): string | undefined {
  if (typeof moduleSlug !== 'string' || moduleSlug === '') return undefined
  if (recordId === undefined || recordId === null || recordId === '') return undefined

  const expression = rollupExpressionOf(property)
  if (!expression) return undefined
  const linked = parseRollupLinkField(expression.link_field)
  if (!linked) return undefined

  const filters = JSON.stringify([
    {
      id: linked.column,
      value: String(recordId),
      variant: 'select',
      operator: 'eq',
      joinOperator: 'and',
    },
  ])

  const params = new URLSearchParams({
    page: '1',
    pageSize: String(pageSize),
    sortBy: 'id',
    sortOrder: 'desc',
    filters,
  })

  return `/${moduleSlug}/${linked.table}?${params.toString()}`
}
