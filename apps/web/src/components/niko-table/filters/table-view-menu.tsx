import type { Column, Table } from "@tanstack/react-table"
import { ChevronsUpDown, Settings2 } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useT } from "@/i18n"
import { formatLabel } from "../lib/format"

/**
 * Derives the display title for a column.
 * Priority: column.meta.label > formatted column.id
 */
function getColumnTitle<TData>(column: Column<TData, unknown>): string {
  return column.columnDef.meta?.label ?? formatLabel(column.id)
}

export interface TableViewMenuProps<TData> {
  table: Table<TData>
  className?: string
  onColumnVisibilityChange?: (columnId: string, isVisible: boolean) => void
}

export function TableViewMenu<TData>({
  table,
  onColumnVisibilityChange,
}: TableViewMenuProps<TData>) {
  const t = useT()
  /**
   * PERFORMANCE: Memoize filtered columns to avoid recalculating on every render.
   *
   * WHY `table.options.columns` is in the dep array:
   * TanStack Table mutates the same `table` object reference across renders — so
   * `[table]` alone never triggers a recompute when navigating to a different table
   * (e.g. Products → Product Categories). `table.options.columns` is the ColumnDef
   * array passed to `useReactTable`; DataTableRoot recreates this array (via its own
   * `useMemo`) whenever the active table changes, giving us a new reference here.
   *
   * NOTE: TanStack's `Table` type has no `table_name` or similar identity property —
   * `options.columns` is the correct API-stable way to detect a column set change.
   */
  const columns = React.useMemo(
    () =>
      table
        .getAllColumns()
        .filter(
          column =>
            typeof column.accessorFn !== "undefined" && column.getCanHide(),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, table.options.columns],
  )

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={t("Toggle columns")}
            // NOT role="combobox": this opens a checklist of columns, it has no
            // text value and no listbox to own. PopoverTrigger already sets
            // aria-expanded and aria-haspopup, which is the whole contract for a
            // disclosure button.
            variant="outline"
            size="sm"
            className="ml-auto hidden h-8 lg:flex"
          />
        }
      >
        <Settings2 />
        {/* A CONTEXT, because the source string is the key and "View" is two
            different words in this app: the noun here (which columns are shown)
            and the verb in the row menu ("View" this record). German wants
            "Ansicht" for one and "Anzeigen" for the other, and without a context
            they would share one entry and one of them would be wrong. */}
        {t({ message: "View", context: "column visibility" })}
        <ChevronsUpDown className="ml-auto opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-fit p-0">
        <Command>
          <CommandInput placeholder={t("Search columns...")} />
          <CommandList>
            <CommandEmpty>{t("No columns found.")}</CommandEmpty>
            <CommandGroup>
              {columns.map(column => (
                <CommandItem
                  key={column.id}
                  // CommandItem auto-renders its own right-aligned check that
                  // shows when data-checked="true" — drive it from visibility
                  // instead of rendering a second manual <Check> (which would
                  // sit left of the invisible built-in one, breaking alignment).
                  data-checked={column.getIsVisible()}
                  onSelect={() => {
                    const newVisibility = !column.getIsVisible()
                    column.toggleVisibility(newVisibility)
                    onColumnVisibilityChange?.(column.id, newVisibility)
                  }}
                >
                  <span className="truncate">{getColumnTitle(column)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/**
 * @required displayName is required for auto feature detection
 * @see "feature-detection.ts"
 */

TableViewMenu.displayName = "TableViewMenu"
