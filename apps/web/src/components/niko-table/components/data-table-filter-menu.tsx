import React from "react"
import { useDataTable } from "../core"
import { TableFilterMenu } from "../filters/table-filter-menu"
import { useGeneratedOptions } from "../hooks/use-generated-options"
import { FILTER_VARIANTS } from "../lib/constants"
import type { Option } from "../types"

type BaseTableFilterMenuProps<TData> = Omit<
  React.ComponentProps<typeof TableFilterMenu<TData>>,
  "table" | "optionsByColumn"
>

interface AutoOptionProps {
  /**
   * Automatically generate select/multi_select options for columns lacking static options
   * @default true
   */
  autoOptions?: boolean
  /** Show counts beside each option (computed from rows) */
  showCounts?: boolean
  /** Recompute counts based on currently filtered rows */
  dynamicCounts?: boolean
  /**
   * If true, only generate options from filtered rows. If false, generate from all rows.
   * This controls which rows are used to generate the option list itself.
   * Note: This is separate from dynamicCounts which controls count calculation.
   * @default true
   */
  limitToFilteredRows?: boolean
  /** Only generate options for these column ids */
  includeColumns?: string[]
  /** Exclude these column ids from generation */
  excludeColumns?: string[]
  /** Limit number of generated options per column */
  limitPerColumn?: number
  /**
   * Merge strategy when static options already exist:
   * - "preserve" keeps user options untouched (default)
   * - "augment" adds counts to matching values
   * - "replace" overrides with generated options
   */
  mergeStrategy?: "preserve" | "augment" | "replace"
}

type DataTableFilterMenuProps<TData> = BaseTableFilterMenuProps<TData> &
  AutoOptionProps

/**
 * A filter menu component that automatically connects to the DataTable context.
 * Filters are managed directly by the table state - no internal state needed.
 *
 * @example - Basic usage
 * <DataTableFilterMenu />
 *
 * @example - Custom alignment and positioning
 * <DataTableFilterMenu align="end" side="bottom" />
 *
 * @example - Custom styling
 * <DataTableFilterMenu className="w-[400px]" />
 */
export function DataTableFilterMenu<TData>({
  autoOptions = true,
  showCounts = true,
  dynamicCounts = true,
  limitToFilteredRows = true,
  includeColumns,
  excludeColumns,
  limitPerColumn,
  mergeStrategy = "preserve",
  ...props
}: DataTableFilterMenuProps<TData>) {
  const { table } = useDataTable<TData>()

  // Generate options map (only includes select/multi_select columns)
  const generatedOptions = useGeneratedOptions(table, {
    showCounts,
    dynamicCounts,
    limitToFilteredRows,
    includeColumns,
    excludeColumns,
    limitPerColumn,
  })

  // Merge generated options with each column's own list according to
  // mergeStrategy. The result is handed to the menu, never written into
  // columnDef.meta: useGeneratedOptions reads meta.options as the column's
  // static list, so writing generated options back there turned one render's
  // generated values into the static list for every render after it.
  const optionsByColumn = React.useMemo(() => {
    const result: Record<string, Option[]> = {}
    if (!autoOptions) return result
    for (const column of table.getAllColumns()) {
      const meta = column.columnDef.meta ?? {}
      const variant = meta.variant ?? FILTER_VARIANTS.TEXT
      if (
        variant !== FILTER_VARIANTS.SELECT &&
        variant !== FILTER_VARIANTS.MULTI_SELECT
      )
        continue
      const gen = generatedOptions[column.id]
      if (!gen || gen.length === 0) continue

      if (!meta.options || mergeStrategy === "replace") {
        result[column.id] = gen
      } else if (mergeStrategy === "augment") {
        const countMap = new Map(gen.map(o => [o.value, o.count]))
        result[column.id] = meta.options.map((opt: Option) => ({
          ...opt,
          count: showCounts
            ? (countMap.get(opt.value) ?? opt.count)
            : undefined,
        }))
      }
      // preserve: the column's own list stands
    }
    return result
  }, [autoOptions, generatedOptions, mergeStrategy, showCounts, table])

  return (
    <TableFilterMenu<TData>
      table={table}
      optionsByColumn={optionsByColumn}
      {...props}
    />
  )
}

/**
 * @required displayName is required for auto feature detection
 * @see "feature-detection.ts"
 */
DataTableFilterMenu.displayName = "DataTableFilterMenu"
