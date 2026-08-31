import { type Column } from "@tanstack/react-table"
import type React from "react"

export const getCommonPinningStyles = <TData>(
  column: Column<TData>,
  isHeader: boolean = false,
): React.CSSProperties => {
  const isPinned = column.getIsPinned()
  if (!isPinned) return {}

  const isLeft = isPinned === "left"
  const columnSize = column.getSize()

  return {
    position: "sticky",
    left: isLeft ? `${column.getStart("left")}px` : undefined,
    right: !isLeft ? `${column.getAfter("right")}px` : undefined,
    opacity: 1,
    width: columnSize,
    minWidth: columnSize, // Prevent column from shrinking
    maxWidth: columnSize, // Prevent column from growing
    flexShrink: 0, // Prevent flex shrinking
    // Headers: z-20 to stay above other headers and body.
    // Body: z-10 to stay above other body cells.
    zIndex: isHeader ? 20 : 10,
    // Pre-resolved OPAQUE equivalent of the row's translucent `bg-muted/50`
    // hover tint (muted at 50% composited over the page background). Pinned
    // cells overlay the columns scrolling beneath them, so they must paint an
    // opaque background — a translucent one lets that content bleed through.
    // Resolving the color ONCE into a variable (instead of a `color-mix()` in a
    // hover utility) means the hover only swaps between two solid colors, which
    // transitions cleanly; the cell's `transition-colors` then keeps it in sync
    // with the rest of the row instead of snapping (the cause of the flicker).
    ["--pin-hover" as string]:
      "color-mix(in srgb, var(--muted) 50%, var(--background))",
    // NB: background is intentionally NOT set here so the bg-* classes at the
    // call sites (base `bg-background` + hover/selected variants) take effect.
    // Thin, SEMI-TRANSPARENT separator line (softer than a hard border). The
    // wider background-colored FADE that dissolves the scrolled-under content
    // of the neighbouring column is a full-height ::after gradient applied via
    // classes at the call site (a box-shadow fade was too narrow / not full
    // height to read as a soft edge).
    boxShadow: isLeft
      ? "1px 0 0 color-mix(in srgb, var(--border) 50%, transparent)"
      : "-1px 0 0 color-mix(in srgb, var(--border) 50%, transparent)",
  } as React.CSSProperties
}
