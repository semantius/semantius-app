import React from "react"
import { type Table } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import {
  // Aliased on purpose: eslint-plugin-lingui treats a JSX element named
  // `Select` as its own ICU component and goes blind inside it. See the
  // no-restricted-syntax note in eslint.config.js.
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/i18n"

export interface TablePaginationProps<TData> {
  table: Table<TData>
  pageSizeOptions?: number[]
  defaultPageSize?: number
  /**
   * External loading state (e.g., from API)
   */
  isLoading?: boolean
  /**
   * External fetching state (e.g., from TanStack Query).
   * Used for displaying loading indicators, but doesn't disable pagination by default.
   */
  isFetching?: boolean
  /**
   * Explicitly disable the next page button.
   * Useful when you want to prevent navigation during initial load but allow it during background fetching.
   */
  disableNextPage?: boolean
  /**
   * Explicitly disable the previous page button.
   * Useful when you want to prevent navigation during initial load but allow it during background fetching.
   */
  disablePreviousPage?: boolean
  /**
   * Total count of items from server (for server-side pagination).
   * If provided, this will be used instead of table.getFilteredRowModel().rows.length
   */
  totalCount?: number
  onPageSizeChange?: (pageSize: number, pageIndex: number) => void
  onPageChange?: (pageIndex: number) => void
  onNextPage?: (pageIndex: number) => void
  onPreviousPage?: (pageIndex: number) => void
  /**
   * Callback when pagination initialization is complete
   */
  onPaginationReady?: () => void
}
export function TablePagination<TData>({
  table,
  pageSizeOptions = [10, 25, 50, 100],
  defaultPageSize = pageSizeOptions[0],
  isLoading,
  isFetching,
  disableNextPage,
  disablePreviousPage,
  totalCount,
  onPageSizeChange,
  onPageChange,
  onNextPage,
  onPreviousPage,
  onPaginationReady,
}: TablePaginationProps<TData>) {
  const t = useT()
  const { pageIndex, pageSize } = table.getState().pagination

  // Use totalCount if provided (server-side), otherwise use filtered row model (client-side)
  const totalRows = totalCount ?? table.getFilteredRowModel().rows.length
  const startItem = totalRows === 0 ? 0 : pageIndex * pageSize + 1
  const endItem = Math.min((pageIndex + 1) * pageSize, totalRows)
  const totalPages = table.getPageCount()
  const currentPage = pageIndex + 1

  // Determine if buttons should be disabled
  // Default to isLoading for initial load, but allow explicit overrides
  // Also disable during fetching to prevent navigation while data is loading
  const canNextPage = table.getCanNextPage()
  const isDisabled = isLoading || isFetching
  const canGoNext = !disableNextPage && !isDisabled && canNextPage
  const canGoPrevious =
    !disablePreviousPage && !isDisabled && table.getCanPreviousPage()

  // Set default page size on initial render
  React.useEffect(() => {
    if (pageSize !== defaultPageSize) {
      table.setPageSize(defaultPageSize)
    }
    onPaginationReady?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show loading skeleton while initializing
  if (isLoading) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-8 w-32" />
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-8 w-20" />
          </div>
          <div className="flex items-center space-x-1">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2"
      aria-label={t("Table pagination")}
    >
      <div className="flex items-center space-x-2">
        <span
          className="text-sm whitespace-nowrap text-muted-foreground"
          id="pagination-page-size-label"
        >
          {t("Items per page")}
        </span>
        <SelectRoot
          value={`${Number(pageSize) === 0 ? defaultPageSize : Number(pageSize)}`}
          onValueChange={value => {
            const newPageSize = Number(value)
            table.setPageSize(newPageSize)
            onPageSizeChange?.(newPageSize, pageIndex)
          }}
          disabled={isLoading}
        >
          <SelectTrigger
            size="sm"
            className="w-16 focus:ring-0"
            aria-label={t("Select page size")}
            aria-labelledby="pagination-page-size-label"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions?.map(size => (
              <SelectItem key={size} value={`${size}`}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
      </div>

      <div
        className="flex-1 text-right text-sm whitespace-nowrap text-muted-foreground md:text-center"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {/* One ICU message per case rather than a range appended to a count:
            the plural category is decided by the TOTAL, and a language with more
            than two categories needs the whole sentence to place it. */}
        {totalRows === 0
          ? t("No items")
          : t("{start}-{end} of {total, plural, one {# item} other {# items}}", {
              start: startItem,
              end: endItem,
              total: totalRows,
            })}
      </div>

      <div className="ml-auto flex items-center space-x-4">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <label htmlFor="page-number-input" className="sr-only">
            {t("Page number")}
          </label>
          <Input
            id="page-number-input"
            type="number"
            min="1"
            max={totalPages}
            value={currentPage}
            onChange={e => {
              const page = Number(e.target.value)
              if (page >= 1 && page <= totalPages) {
                const newPageIndex = page - 1
                table.setPageIndex(newPageIndex)
                onPageChange?.(newPageIndex)
              }
            }}
            onBlur={e => {
              const page = Number(e.target.value)
              if (isNaN(page) || page < 1 || page > totalPages) {
                if (e.currentTarget) {
                  e.currentTarget.value = currentPage.toString()
                }
              }
            }}
            className="h-8 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            style={{
              // Hug the content: reserve room for the widest page number
              // (digits scale with the page count) plus the input's padding.
              // The native spinner is removed above, so no extra gap remains.
              width: `calc(${Math.max(String(totalPages).length, 1)}ch + 1.75rem)`,
            }}
            disabled={totalPages === 0 || isLoading || isFetching}
            aria-label={t("Page {page} of {total}", { page: currentPage, total: totalPages })}
          />
          <span className="whitespace-nowrap" aria-hidden="true">
            {t("of {count, plural, one {# page} other {# pages}}", {
              count: Math.max(1, totalPages),
            })}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              const newPageIndex = pageIndex - 1
              table.previousPage()
              onPreviousPage?.(newPageIndex)
            }}
            disabled={!canGoPrevious}
            aria-label={t("Go to previous page, page {page}", { page: pageIndex })}
            title={t("Go to previous page")}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              const newPageIndex = pageIndex + 1
              table.nextPage()
              onNextPage?.(newPageIndex)
            }}
            disabled={!canGoNext}
            aria-label={t("Go to next page, page {page}", { page: pageIndex + 2 })}
            title={t("Go to next page")}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  )
}

/**
 * @required displayName is required for auto feature detection
 * @see "feature-detection.ts"
 */

TablePagination.displayName = "TablePagination"
