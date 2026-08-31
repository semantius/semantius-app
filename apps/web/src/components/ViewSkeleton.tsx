import { Skeleton } from '@/components/ui/skeleton'
import type { EntityMetadata } from '@/types/metadata'

/**
 * Loading placeholder for the dynamic entity views — the route's
 * `pendingComponent` and the Suspense fallback in _app.$moduleId.$table_name.
 * Mirrors the real View layout (breadcrumb, title + description with an action
 * button, the search/sort/filter/view toolbar, and a header-plus-rows table) so
 * the page doesn't visibly jump when the actual content swaps in.
 *
 * When `metadata` is available (the Suspense fallback path — the route loader
 * has already resolved get_schema, only the view chunk is still in flight) the
 * title and description are rendered for real and the column count is derived
 * from the entity, so the crossfade only has to replace the rows.
 */
export function ViewSkeleton({ metadata }: { metadata?: EntityMetadata }) {
  const columns = skeletonColumns(metadata)

  return (
    // Fade in so a skeleton that does appear arrives softly instead of
    // snapping. Never applied to real content — only to this placeholder.
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Breadcrumb — text-sm, 20px line box, 10px caps */}
      <div className="flex h-5 items-center gap-2">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="size-3.5" />
        <Skeleton className="h-2.5 w-24" />
      </div>

      {/* Title + description + primary action */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          {metadata ? (
            /* Same classes as the real heading in views/View.tsx. */
            <h1 className="text-3xl font-bold tracking-tight">
              {metadata.table?.plural_label || 'Records'}
            </h1>
          ) : (
            /* h-9 wrapper = the text-3xl line box, so the block occupies the
               same space as the real <h1>; the bar inside is the 22px cap
               height. */
            <div className="flex h-9 items-center">
              <Skeleton className="h-5.5 w-56" />
            </div>
          )}
          {metadata ? (
            <p className="text-muted-foreground">
              {metadata.table?.description || 'Manage records'}
            </p>
          ) : (
            <div className="flex h-6 items-center">
              <Skeleton className="h-3 w-72" />
            </div>
          )}
        </div>
        {/* Controls are blocks, not text: these match the real control box.
            Button default size is h-8 rounded-2xl (ui/button.tsx). */}
        <Skeleton className="h-8 w-36 rounded-2xl" />
      </div>

      {/* Toolbar: search (Input, h-8) + sort/filter (Button size="sm", h-7) +
          view menu (Button size="sm" overridden to h-8) */}
      <div className="flex items-center justify-between gap-4">
        {/* max-w-100 = 400px, the width DataTableView gives the real search */}
        <Skeleton className="h-8 w-full max-w-100 rounded-2xl" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-20 rounded-2xl" />
          <Skeleton className="h-7 w-20 rounded-2xl" />
          <Skeleton className="h-8 w-20 rounded-2xl" />
        </div>
      </div>

      {/* Table. Row boxes mirror the real grid — TableHead is h-10, TableCell
          is p-2 around a 20px line box — while the bars are cap height, so the
          rhythm matches without the bars reading as solid blocks. */}
      <div>
        {/* Header row */}
        <div className="flex h-10 items-center gap-4 border-b">
          {columns.map((width, i) => (
            <Skeleton key={i} className={`h-2.5 ${width}`} />
          ))}
        </div>
        {/* Body rows */}
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="flex h-9 items-center gap-4">
            {columns.map((width, i) => (
              <Skeleton key={i} className={`h-2.5 ${width}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Column widths roughly matching a typical entity grid (label, id, a few
// text/badge columns). Shared between the header and body rows so they align,
// and cycled when the real column count comes from metadata.
const SKELETON_COLUMNS = [
  'w-40',
  'w-12',
  'w-56',
  'w-40',
  'w-32',
  'w-24',
] as const

// Beyond this the bars overflow a typical viewport and stop looking like a grid.
const MAX_SKELETON_COLUMNS = 8

/**
 * Column-width classes for the skeleton grid. With metadata, the *count* comes
 * from the entity so the placeholder has the same number of columns the real
 * grid will draw.
 *
 * The skip rules below mirror the column build in
 * components/data-table-view/DataTableView.tsx — keep the two in step. (Only the
 * count matters here, so the rules are duplicated rather than shared; a mismatch
 * costs a slightly wrong bar count, never a wrong grid.)
 */
function skeletonColumns(metadata?: EntityMetadata): readonly string[] {
  const properties = metadata?.properties
  if (!properties) return SKELETON_COLUMNS

  let count = 0
  for (const [key, property] of Object.entries(properties)) {
    if (key.startsWith('_') || key.endsWith('_at')) continue
    if (property.ctype === 'fk_label' || property.ctype === '_label') continue
    if (
      property.format === 'json' ||
      property.format === 'markdown' ||
      property.format === 'html'
    )
      continue
    count++
  }

  if (count === 0) return SKELETON_COLUMNS
  return Array.from(
    { length: Math.min(count, MAX_SKELETON_COLUMNS) },
    (_, i) => SKELETON_COLUMNS[i % SKELETON_COLUMNS.length],
  )
}
