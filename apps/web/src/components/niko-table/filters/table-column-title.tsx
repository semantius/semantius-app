"use client"

import React from "react"
import type { Column } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import { useDerivedColumnTitle } from "../hooks"

/**
 * Renders the column title.
 *
 * When the column is sortable the caller passes `onClick` and the title becomes a
 * real `<button>` rather than a `<div onClick>`. Clicking a header to sort is the
 * universal grid idiom, and as a div it was mouse-only: no tab stop, no focus
 * ring, no Enter/Space, and nothing announcing that the text does anything
 * (2.1.1, 2.4.7). The button is styled to look exactly like the plain title —
 * `text-left` and `w-full` keep the truncation behavior identical.
 *
 * The sorted state itself is announced from `aria-sort` on the enclosing `<th>`
 * (see DataTableHeader); it deliberately is not repeated in the button's label,
 * which would make every header read its state twice.
 */
export function TableColumnTitle<TData, TValue>({
  column,
  title,
  className,
  children,
  onClick,
}: {
  column: Column<TData, TValue>
  title?: string
  className?: string
  children?: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
}) {
  const derivedTitle = useDerivedColumnTitle(column, column.id, title)
  const content = children ?? derivedTitle

  const baseClassName = cn(
    "truncate py-0.5 text-sm font-semibold transition-colors",
    className,
  )

  if (!onClick) {
    return <div className={baseClassName}>{content}</div>
  }

  // 2.5.8 Target Size. Height is already 24px (a 20px line box + py-0.5), so
  // the dimension that fails is WIDTH: `w-full` is only a maximum inside a
  // flex header, and a two-letter title ("Id") in a right-aligned numeric
  // column shrank to 16px — with the 24px sort icon 2px away, so the spacing
  // exception did not apply either. Measured on the 320px preview, not
  // theorized; the first diagnosis ("add min-h-6") would have changed nothing.
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        baseClassName,
        "min-h-6 min-w-6 w-full text-left rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {content}
    </button>
  )
}

TableColumnTitle.displayName = "TableColumnTitle"
