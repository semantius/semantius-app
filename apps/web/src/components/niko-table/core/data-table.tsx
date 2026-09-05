"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { Table } from "@/components/ui/table"
import { useDataTable } from "./data-table-context"

/**
 * Extracts height from Tailwind arbitrary values (e.g., h-[600px], max-h-[400px]).
 * Converts them to inline styles to ensure scroll events work reliably.
 * For other height utilities, use the height/maxHeight props directly.
 */
function parseHeightFromClassName(className?: string) {
  if (!className)
    return { height: undefined, maxHeight: undefined, safeClassName: className }

  const classes = className.split(/\s+/)
  let height: string | undefined
  let maxHeight: string | undefined
  const remainingClasses: string[] = []

  for (const cls of classes) {
    // Match arbitrary values: h-[600px], max-h-[400px]
    const heightMatch = cls.match(/^h-\[([^\]]+)\]$/)
    const maxHeightMatch = cls.match(/^max-h-\[([^\]]+)\]$/)

    if (heightMatch) {
      height = heightMatch[1]
    } else if (maxHeightMatch) {
      maxHeight = maxHeightMatch[1]
    } else {
      remainingClasses.push(cls)
    }
  }

  return {
    height,
    maxHeight,
    safeClassName: remainingClasses.join(" "),
  }
}

export interface DataTableContainerProps {
  children: React.ReactNode
  className?: string
  height?: number | string
  maxHeight?: number | string
}

/**
 * DataTable container component that wraps the table and provides scrolling behavior.
 *
 * @example
 * Without height - table grows with content, no scroll
 * <DataTable>
 *   <DataTableHeader />
 *   <DataTableBody />
 * </DataTable>
 *
 * @example
 * With height prop - enables scrolling and scroll event callbacks
 * <DataTable height={600}>
 *   <DataTableHeader />
 *   <DataTableBody
 *     onScroll={(e) => console.log(`Scrolled ${e.percentage}%`)}
 *     onScrolledBottom={() => console.log('Load more data')}
 *   />
 * </DataTable>
 *
 * @example
 * With arbitrary height in className - automatically extracted and applied as inline style
 * <DataTable className="h-[600px]">
 *   <DataTableBody onScroll={...} />
 * </DataTable>
 *
 * @example
 * Prefer using height prop for better type safety and clarity
 * <DataTable height="600px" className="rounded-lg">
 *   <DataTableBody onScroll={...} />
 * </DataTable>
 */
export function DataTable({
  children,
  className,
  height,
  maxHeight,
}: DataTableContainerProps) {
  // Parse height from className if not provided via props
  const parsed = React.useMemo(
    () => parseHeightFromClassName(className),
    [className],
  )

  const finalHeight = height ?? parsed.height
  const finalMaxHeight = maxHeight ?? parsed.maxHeight ?? finalHeight

  // 2.4.11 Focus Not Obscured.
  //
  // Pinned columns are `position: sticky` and paint OVER the columns scrolling
  // beneath them. When focus moves to a header button or a cell control in a
  // scrolled-away column, the browser scrolls it to the container's edge — which
  // is precisely where the pinned column sits — and the focused control ends up
  // entirely behind it. Measured on a 390px viewport: every column header past
  // the pinned one was completely hidden while focused.
  //
  // `scroll-padding` is the mechanism CSS provides for exactly this: it tells the
  // scrolling machinery that the first N pixels of the container are spoken for,
  // so scrollIntoView stops short of them. The value has to be computed, because
  // it is the sum of the pinned columns' widths and those come from the column
  // model at runtime.
  const { table } = useDataTable()
  const { scrollPaddingLeft, scrollPaddingRight } = React.useMemo(() => {
    const visible = table?.getVisibleLeafColumns?.() ?? []
    let left = 0
    let right = 0
    for (const column of visible) {
      const pinned = column.getIsPinned()
      if (pinned === "left") left += column.getSize()
      else if (pinned === "right") right += column.getSize()
    }
    return { scrollPaddingLeft: left || undefined, scrollPaddingRight: right || undefined }
  }, [table])

  return (
    <div
      data-slot="table-container"
      className={cn(
        "relative w-full overflow-auto rounded-lg border",
        // Custom scrollbar styling to match ScrollArea aesthetic
        // Scrollbar visible but subtle by default, more prominent on hover
        "[&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5",
        "[&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/40",
        "hover:[&::-webkit-scrollbar-thumb]:bg-border",
        "[&::-webkit-scrollbar-thumb:hover]:bg-border/80!",
        // Firefox scrollbar styling
        "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/40",
        "hover:scrollbar-thumb-border",
        parsed.safeClassName,
      )}
      style={{
        height: finalHeight,
        maxHeight: finalMaxHeight,
        scrollPaddingLeft,
        scrollPaddingRight,
        // The header is `sticky top-0`; without this a focused control in the
        // first visible row scrolls to exactly underneath it. 2.5rem is the
        // header row's height at every density this table renders at.
        scrollPaddingTop: '2.5rem',
      }}
    >
      <Table className="w-full">{children}</Table>
    </div>
  )
}

DataTable.displayName = "DataTable"
