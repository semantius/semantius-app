"use client"

import * as React from "react"
import { Star } from "lucide-react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTable } from "@/hooks/useTable"
import { useT } from "@/i18n"
import {
  useCreateRecord,
  useDeleteRecord,
  useUpdateRecord,
} from "@/hooks/useTableMutations"

/** Row shape we read back from the `user_bookmarks` table. */
interface BookmarkRow {
  id: number
  title: string
  url: string
  // Index signature so the row satisfies the mutation hooks' Record<string, unknown> constraint.
  [key: string]: unknown
}

interface BookmarkIconProps {
  /** Canonical URL for the bookmarked page. A bookmark is matched 1:1 by this value. */
  url: string
  /** Display title stored with the bookmark. Kept in sync if it drifts from the stored value. */
  title: string
  /** Optional noun for the tooltip, e.g. "issue" → "Favorite issue". */
  label?: string
  className?: string
}

/**
 * Star toggle that bookmarks the current page into the `user_bookmarks` table.
 *
 * On mount it looks the table up by `url`: a matching row → filled star, no row →
 * empty star. When a row exists but its stored `title` no longer matches the `title`
 * prop, the row is silently updated so the sidebar favorites list stays current.
 * Clicking (or pressing Alt+F) toggles: create when missing, delete when present.
 *
 * `user_bookmarks` is row-level scoped to the current user and auto-fills `user_id`
 * and `row_order` on insert, so we only ever send `{ title, url }`.
 */
export function BookmarkIcon({ url, title, label, className }: BookmarkIconProps) {
  const t = useT()
  const { data, isLoading } = useTable<BookmarkRow>("user_bookmarks", {
    // url may contain "/" and other reserved chars — encode it for the eq. filter.
    query: `select=id,title,url&url=eq.${encodeURIComponent(url)}`,
    enabled: !!url,
  })

  const existing = data?.[0]
  const isBookmarked = !!existing

  const createBookmark = useCreateRecord<BookmarkRow>("user_bookmarks")
  const updateBookmark = useUpdateRecord<BookmarkRow>("user_bookmarks")
  const deleteBookmark = useDeleteRecord("user_bookmarks")

  // Sync a stale stored title back to the current page title. Once the PATCH
  // refetches, existing.title === title and this no longer fires.
  React.useEffect(() => {
    if (existing && title && existing.title !== title) {
      updateBookmark.mutate({ id: existing.id, title })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, existing?.title, title])

  const pending = createBookmark.isPending || deleteBookmark.isPending

  const toggle = React.useCallback(() => {
    if (!url || isLoading || pending) return
    if (existing) {
      deleteBookmark.mutate(existing.id)
    } else {
      createBookmark.mutate({ title, url })
    }
  }, [url, isLoading, pending, existing, title, createBookmark, deleteBookmark])

  // Alt+F keyboard shortcut (mirrors the tooltip hint).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [toggle])

  // Four whole sentences rather than a verb glued to a name: German puts the
  // object before the verb ("Acme zu Favoriten hinzufügen"), so there is no
  // "verb" fragment to reuse, and the no-label case is its own message.
  const tooltipText = label
    ? isBookmarked
      ? t("Remove {label} from favorites", { label })
      : t("Add {label} to favorites", { label })
    : isBookmarked
      ? t("Remove from favorites")
      : t("Add to favorites")

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={tooltipText}
            aria-pressed={isBookmarked}
            onClick={toggle}
            disabled={isLoading || pending}
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
              className
            )}
          />
        }
      >
        <Star
          className={cn(
            "size-3.5 transition-colors",
            isBookmarked && "fill-yellow-400 text-yellow-400"
          )}
        />
      </TooltipTrigger>
      <TooltipContent>
        <span>{tooltipText}</span>
        <kbd
          data-slot="kbd"
          className="ml-1 inline-flex items-center gap-1 border border-background/20 bg-background/15 px-1 py-px font-sans text-[10px] text-background"
        >
          <span>{t("Alt")}</span>
          <span>F</span>
        </kbd>
      </TooltipContent>
    </Tooltip>
  )
}
