import { useState, useEffect, useCallback, useMemo, useContext } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { type EntityMetadata, type TableMetadata } from '@/types/metadata'
import { cn } from '@/lib/utils'
import { formatNumberForDisplay, resolvePrecision } from '@/lib/number-format'
import { formatDateForDisplay, isDateFormat } from '@/lib/date-format'
import { useTable } from '@/hooks/useTable'
import { useUpdateRecord } from '@/hooks/useTableMutations'
import { useConfirmDelete } from '@/hooks/useConfirmDelete'
import { useUserHasPermission } from '@/hooks/useUserPermissions'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { buildPostgRESTSelect, AUTO_LABEL } from '@/lib/apiClient'
import {
  type SortingState,
  type Updater,
  type PaginationState,
} from '@tanstack/react-table'
import {
  DataTableRoot,
  DataTable,
  DataTableHeader,
  DataTableBody,
  DataTableEmptyBody,
  DataTableSkeleton,
  RowDragContext,
  type DataTableReorderEvent,
} from '@/components/niko-table/core'
import { DataTablePagination } from '@/components/niko-table/components/data-table-pagination'
import { DataTableSearchFilter } from '@/components/niko-table/components/data-table-search-filter'
import { DataTableFilterMenu } from '@/components/niko-table/components/data-table-filter-menu'
import { DataTableViewMenu } from '@/components/niko-table/components/data-table-view-menu'
import { DataTableSortMenu } from '@/components/niko-table/components/data-table-sort-menu'
import { DataTableToolbarSection } from '@/components/niko-table/components/data-table-toolbar-section'
import { DataTableColumnHeader } from '@/components/niko-table/components/data-table-column-header'
import { DataTableColumnTitle } from '@/components/niko-table/components/data-table-column-title'
import { DataTableColumnSortMenu } from '@/components/niko-table/components/data-table-column-sort'
import { FILTER_VARIANTS, JOIN_OPERATORS, type FilterVariant } from '@/components/niko-table/lib/constants'
import type { DataTableColumnDef, ExtendedColumnFilter } from '@/components/niko-table/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MoreHorizontal,
  Pencil,
  Eye,
  Trash2,
  GripVertical,
} from 'lucide-react'

type RecordType = Record<string, unknown>

// Drag handle for a reorderable row. Consumes RowDragContext (provided by the
// sortable row, which calls useSortable once) to get the activator ref +
// listeners — no second useSortable here. Rendered as a <button> so the row's
// click handler ignores grabs (it skips clicks inside buttons).
function RowDragHandle() {
  const ctx = useContext(RowDragContext)
  if (!ctx) return null
  return (
    <button
      ref={ctx.setActivatorNodeRef}
      type="button"
      aria-label="Drag to reorder"
      className={cn(
        'flex items-center justify-center text-muted-foreground hover:text-foreground',
        'cursor-grab touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'active:cursor-grabbing',
      )}
      {...ctx.attributes}
      {...ctx.listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}
type PlainFilter = Omit<ExtendedColumnFilter<RecordType>, 'filterId'>

/**
 * Descriptor for an extra per-row entry appended to the row "..." menu.
 * Declarative (not raw JSX) so DataTableView keeps ownership of the Base-UI
 * DropdownMenuItem wrapping, stopPropagation, icon spacing, and destructive
 * styling — consistent with the built-in Edit/Delete items.
 */
export interface RowMenuItem {
  key: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onClick?: (record: RecordType) => void
  disabled?: boolean
  destructive?: boolean
}

export interface DataTableViewProps {
  metadata: EntityMetadata
  onRowClick?: (record: RecordType) => void
  onEdit?: (record: RecordType) => void
  onEditModal?: (record: RecordType) => void
  editRoute?: string
  canEdit?: boolean
  emptyMessage?: string
  emptyIcon?: React.ReactNode
  excludeColumns?: string[]
  /** Optional per-row extra "..." menu entries, computed from the row record. */
  getRowMenuItems?: (record: RecordType) => RowMenuItem[]
}

// Helper to map metadata property type to niko-table filter variant
function getFilterVariant(property: {
  type?: string | string[]
  enum?: string[]
  reference_table?: string
}): FilterVariant {
  if (property.enum && property.enum.length > 0) return FILTER_VARIANTS.SELECT
  if (property.reference_table) return FILTER_VARIANTS.SELECT
  const type = Array.isArray(property.type) ? property.type[0] : property.type
  if (type === 'integer' || type === 'number') return FILTER_VARIANTS.NUMBER
  if (type === 'boolean') return FILTER_VARIANTS.BOOLEAN
  return FILTER_VARIANTS.TEXT
}

// Default display width for a property in the grid.
// - boolean → 's' (fits a toggle/checkbox column)
// - multiline, json, html, jsonata → 'w' (wide)
// - number, integer (without a format) → 's'
// - everything else → 'm'
function getDefaultWidthForGrid(format?: string, type?: string): 's' | 'm' | 'w' {
  if (type === 'boolean') return 's'
  if (format === 'multiline' || format === 'json' || format === 'html' || format === 'jsonata') return 'w'
  if (!format && (type === 'number' || type === 'integer')) return 's'
  return 'm'
}

// Returns the width bucket ('s' | 'm' | 'w') for a metadata property.
// Explicit property.width takes precedence; falls back to getDefaultWidthForGrid.
function getWidthBucket(property: { width?: string; format?: string; type?: string | string[] }): 's' | 'm' | 'w' {
  if (property.width === 's' || property.width === 'm' || property.width === 'w') return property.width
  return getDefaultWidthForGrid(property.format, Array.isArray(property.type) ? property.type[0] : property.type)
}

// Fixed pixel widths for sticky-left-pinned columns, keyed by width bucket.
// Unpinned columns stay size-less (natural distribution); pinned columns MUST
// have an explicit width so the sticky offset (column.getStart('left')) matches
// the rendered width and the cell content can be truncated to it — otherwise
// long values overflow into the neighbouring column.
const PINNED_WIDTH_PX: Record<'s' | 'm' | 'w', number> = { s: 100, m: 220, w: 340 }

// Convert one ExtendedColumnFilter to one or more PostgREST AND query parameters.
// Returns an array because 'between' requires two parameters.
function filterToPostgRESTParams(filter: PlainFilter): string[] {
  const col = filter.id as string
  const val = filter.value
  const op = filter.operator

  if (
    (val === undefined || val === null || val === '' ||
      (Array.isArray(val) && val.length === 0)) &&
    op !== 'empty' && op !== 'not.empty'
  ) return []

  const strVal = Array.isArray(val) ? (val[0] ?? '') : (val ?? '')

  switch (op) {
    case 'ilike': return [`${col}=ilike.*${strVal}*`]
    case 'not.ilike': return [`${col}=not.ilike.*${strVal}*`]
    case 'eq': return strVal !== '' ? [`${col}=eq.${strVal}`] : []
    case 'neq': return strVal !== '' ? [`${col}=neq.${strVal}`] : []
    case 'in': {
      const vals = (Array.isArray(val) ? val : String(val).split(',')).filter(v => v !== '')
      return vals.length > 0 ? [`${col}=in.(${vals.join(',')})`] : []
    }
    case 'not.in': {
      const vals = (Array.isArray(val) ? val : String(val).split(',')).filter(v => v !== '')
      return vals.length > 0 ? [`${col}=not.in.(${vals.join(',')})`] : []
    }
    case 'empty': return [`${col}=is.null`]
    case 'not.empty': return [`${col}=not.is.null`]
    case 'lt': return strVal !== '' ? [`${col}=lt.${strVal}`] : []
    case 'lte': return strVal !== '' ? [`${col}=lte.${strVal}`] : []
    case 'gt': return strVal !== '' ? [`${col}=gt.${strVal}`] : []
    case 'gte': return strVal !== '' ? [`${col}=gte.${strVal}`] : []
    case 'between': {
      const arr = Array.isArray(val) ? val : []
      const result: string[] = []
      if (arr[0] !== undefined && arr[0] !== '') result.push(`${col}=gte.${arr[0]}`)
      if (arr[1] !== undefined && arr[1] !== '') result.push(`${col}=lte.${arr[1]}`)
      return result
    }
    default: return []
  }
}

// Convert one filter to PostgREST dot-notation (for use inside or=(...))
function filterToORCondition(filter: PlainFilter): string | null {
  const col = filter.id as string
  const val = filter.value
  const op = filter.operator

  if (
    (val === undefined || val === null || val === '' ||
      (Array.isArray(val) && val.length === 0)) &&
    op !== 'empty' && op !== 'not.empty'
  ) return null

  const strVal = Array.isArray(val) ? (val[0] ?? '') : (val ?? '')

  switch (op) {
    case 'ilike': return `${col}.ilike.*${strVal}*`
    case 'not.ilike': return `${col}.not.ilike.*${strVal}*`
    case 'eq': return strVal !== '' ? `${col}.eq.${strVal}` : null
    case 'neq': return strVal !== '' ? `${col}.neq.${strVal}` : null
    case 'in': {
      const vals = (Array.isArray(val) ? val : String(val).split(',')).filter(v => v !== '')
      return vals.length > 0 ? `${col}.in.(${vals.join(',')})` : null
    }
    case 'lt': return strVal !== '' ? `${col}.lt.${strVal}` : null
    case 'lte': return strVal !== '' ? `${col}.lte.${strVal}` : null
    case 'gt': return strVal !== '' ? `${col}.gt.${strVal}` : null
    case 'gte': return strVal !== '' ? `${col}.gte.${strVal}` : null
    case 'empty': return `${col}.is.null`
    case 'not.empty': return `${col}.not.is.null`
    default: return null
  }
}

// Deserialize filters from URL JSON string, regenerating filterId deterministically.
// TanStack Router stores string search params as JSON-encoded strings (double-encoded),
// so we unwrap one layer if needed.
function parseFiltersFromURL(filtersParam: string | undefined): ExtendedColumnFilter<RecordType>[] {
  if (!filtersParam) return []
  try {
    let parsed = JSON.parse(filtersParam)
    // TanStack Router may have double-encoded the value: unwrap if it's still a string
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    if (!Array.isArray(parsed)) return []
    return (parsed as PlainFilter[]).map((f, i) => ({
      ...f,
      filterId: `url-filter-${f.id as string}-${f.operator}-${i}`,
    }))
  } catch {
    return []
  }
}

// Serialize filters for URL (strip filterId to keep URLs short)
function serializeFiltersForURL(filters: ExtendedColumnFilter<RecordType>[]): string | undefined {
  if (filters.length === 0) return undefined
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return JSON.stringify(filters.map(({ filterId: _id, ...rest }) => rest))
}

export function DataTableView({
  metadata,
  onRowClick,
  onEdit,
  onEditModal,
  editRoute,
  canEdit = true,
  emptyMessage,
  emptyIcon: _emptyIcon,
  excludeColumns = [],
  getRowMenuItems,
}: DataTableViewProps) {
  const tableMetadata = metadata.table as TableMetadata | undefined

  if (!tableMetadata) throw new Error('DataTableView requires metadata.table to be defined')
  if (!tableMetadata.table_name) throw new Error('DataTableView requires metadata.table.table_name to be defined')
  if (!tableMetadata.id_column) throw new Error('DataTableView requires metadata.table.id_column to be defined')
  if (!tableMetadata.label_column) throw new Error('DataTableView requires metadata.table.label_column to be defined')

  const tableName = tableMetadata.table_name
  const primaryKeyColumn = tableMetadata.id_column
  const displayColumn = tableMetadata.label_column
  // When the schema declares an order_column, the grid is sorted by it (asc) and
  // rows can be drag-reordered. The column may not exist in `properties`, so it
  // is appended to the query select/order explicitly below.
  const orderColumn = tableMetadata.order_column || ''

  // Default ordering: by the order_column (handled in the query as an appended
  // order term, so sorting state stays empty), else newest-first by primary key.
  const defaultSorting = (): SortingState =>
    orderColumn ? [] : [{ id: primaryKeyColumn, desc: true }]

  // --- URL search params (read-only, truth comes from our state) ---
  const searchParams = useSearch({
    strict: false,
    select: (search) => ({
      page: (search as { page?: number }).page,
      pageSize: (search as { pageSize?: number }).pageSize,
      sortBy: (search as { sortBy?: string }).sortBy,
      sortOrder: (search as { sortOrder?: 'asc' | 'desc' }).sortOrder,
      search: (search as { search?: string }).search,
      filters: (search as { filters?: string }).filters,
      _pf: (search as { _pf?: string })._pf,
      _pv: (search as { _pv?: string })._pv,
    }),
    structuralSharing: true,
  })

  const navigate = useNavigate()

  const getDefaultPageSize = () => {
    const h = window.innerHeight
    if (h > 1330) return 20
    if (h > 1070) return 15
    return 10
  }

  // --- Controlled state: all owned here, synced to URL ---
  const [pagination, setPaginationState] = useState<PaginationState>(() => ({
    pageIndex: searchParams.page ? searchParams.page - 1 : 0,
    pageSize: searchParams.pageSize || getDefaultPageSize(),
  }))

  const [sorting, setSortingState] = useState<SortingState>(() => {
    const col = searchParams.sortBy
    const exists = col && metadata.properties?.[col]
    return exists
      ? [{ id: col, desc: searchParams.sortOrder === 'desc' }]
      : defaultSorting()
  })

  // extFilters = all niko-table filter rows (AND + OR), server-side, in URL
  const [extFilters, setExtFilters] = useState<ExtendedColumnFilter<RecordType>[]>(
    () => parseFiltersFromURL(searchParams.filters)
  )

  // searchText = global search box, server-side (or= ilike across text cols), in URL
  const [searchText, setSearchText] = useState<string>(searchParams.search || '')

  // Reset state when the underlying table changes (navigation between routes)
  useEffect(() => {
    setPaginationState({
      pageIndex: searchParams.page ? searchParams.page - 1 : 0,
      pageSize: searchParams.pageSize || getDefaultPageSize(),
    })
    const col = searchParams.sortBy
    const exists = col && metadata.properties?.[col]
    setSortingState(
      exists
        ? [{ id: col, desc: searchParams.sortOrder === 'desc' }]
        : defaultSorting()
    )
    setExtFilters(parseFiltersFromURL(searchParams.filters))
    setSearchText(searchParams.search || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName])

  // --- Sync ALL state to URL whenever any piece changes ---
  useEffect(() => {
    const targetPage = pagination.pageIndex + 1
    const targetPageSize = pagination.pageSize
    const targetSortBy = sorting[0]?.id
    const targetSortOrder = sorting[0]?.desc ? 'desc' : 'asc'
    const targetSearch = searchText || undefined
    const targetFilters = serializeFiltersForURL(extFilters)

    const currentPage = searchParams.page || 1
    const currentPageSize = searchParams.pageSize || 10
    const currentSortBy = searchParams.sortBy
    const currentSortOrder = searchParams.sortOrder || 'asc'
    const currentSearch = searchParams.search
    const currentFilters = searchParams.filters

    if (
      currentPage === targetPage &&
      currentPageSize === targetPageSize &&
      currentSortBy === targetSortBy &&
      currentSortOrder === targetSortOrder &&
      currentSearch === targetSearch &&
      currentFilters === targetFilters
    ) return

    navigate({
      search: (prev: unknown) => ({
        ...(prev as object),
        page: targetPage,
        pageSize: targetPageSize,
        ...(targetSortBy ? { sortBy: targetSortBy, sortOrder: targetSortOrder } : { sortBy: undefined, sortOrder: undefined }),
        ...(targetSearch ? { search: targetSearch } : { search: undefined }),
        ...(targetFilters ? { filters: targetFilters } : { filters: undefined }),
      }),
      replace: true,
      resetScroll: false,
    } as Parameters<typeof navigate>[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.pageIndex, pagination.pageSize, sorting, searchText, extFilters])

  // Column the active parent filter (_pf/_pv) pins to a single value, if any.
  // Rows are then constant in that column, so a sort on it does NOT change their
  // order — the appended order_column.asc still governs (e.g. fields filtered to
  // one table_name, sorted by table_name).
  const parentFilterColumn = useMemo(() => {
    const pf = searchParams._pf
    const pv = searchParams._pv
    if (!pf || pv === undefined || pv === '') return ''
    const dot = pf.indexOf('.')
    return dot >= 0 ? pf.slice(dot + 1) : pf
  }, [searchParams._pf, searchParams._pv])

  // Drag reordering needs the rows to actually be in order_column order. That holds
  // when there is no sort, or every sort column is the order_column itself or the
  // constant parent-filter column. Any OTHER column sort reorders the rows away
  // from order_column, so DnD is disabled then. (`every` is true for an empty sort.)
  const dndEnabled =
    !!orderColumn &&
    sorting.every(s => s.id === orderColumn || s.id === parentFilterColumn)

  // --- Build the PostgREST query (every state change triggers a new API call) ---
  const query = useMemo(() => {
    const params: string[] = []

    // The order_column may not be part of the schema properties, so append it to
    // the select explicitly (the grid reads it back when reordering).
    let selectClause = buildPostgRESTSelect(metadata)
    if (orderColumn && !selectClause.split(',').includes(orderColumn)) {
      selectClause += `,${orderColumn}`
    }
    params.push(`select=${selectClause}`)
    params.push(`limit=${pagination.pageSize}`)
    params.push(`offset=${pagination.pageIndex * pagination.pageSize}`)

    // Order: user-chosen sort first (if any), then the order_column.asc as the
    // saved/tiebreaker order so reordered rows come back in their persisted order.
    const orderParts: string[] = []
    if (sorting.length > 0) {
      orderParts.push(...sorting.map(s => `${s.id}.${s.desc ? 'desc' : 'asc'}`))
    }
    if (orderColumn && !sorting.some(s => s.id === orderColumn)) {
      orderParts.push(`${orderColumn}.asc`)
    }
    if (orderParts.length > 0) {
      params.push(`order=${orderParts.join(',')}`)
    }

    // AND filters from filter menu
    const andFilters = extFilters.filter(
      f => !f.joinOperator || f.joinOperator === JOIN_OPERATORS.AND
    )
    for (const f of andFilters) {
      params.push(...filterToPostgRESTParams(f))
    }

    // OR filters from filter menu → PostgREST or=(...)
    const orFilters = extFilters.filter(f => f.joinOperator === JOIN_OPERATORS.OR)
    if (orFilters.length > 0) {
      const conditions = orFilters.map(filterToORCondition).filter(Boolean) as string[]
      if (conditions.length > 0) params.push(`or=(${conditions.join(',')})`)
    }

    // Parent filter from _pf/_pv URL params (independent of filter menu)
    // _pf format: "{tableName}.{columnName}" — extract the column name after the dot
    const pf = searchParams._pf
    const pv = searchParams._pv
    if (pf && pv !== undefined && pv !== '') {
      const dotIndex = pf.indexOf('.')
      const parentColumn = dotIndex >= 0 ? pf.slice(dotIndex + 1) : pf
      if (parentColumn) {
        params.push(`${parentColumn}=eq.${pv}`)
      }
    }

    // Global search box → wfts (full-text search) on search_vector column
    const trimmedSearch = searchText.trim()
    if (trimmedSearch) {
      params.push(`search_vector=wfts(simple).${encodeURIComponent(trimmedSearch)}`)
    }

    return params.join('&')
  }, [pagination.pageIndex, pagination.pageSize, sorting, extFilters, searchText, metadata, orderColumn, searchParams._pf, searchParams._pv])

  const { data, totalCount, isLoading, error, refetch } = useTable<RecordType>(tableName, {
    query,
    count: true,
    placeholderData: (prev) => prev,
  })

  if (error) throw error

  const totalPages = totalCount ? Math.ceil(totalCount / pagination.pageSize) : undefined

  // --- Permissions ---
  const hasEditPermission = useUserHasPermission(tableMetadata?.edit_permission || '')
  const effectiveCanEdit = canEdit && (tableMetadata?.edit_permission ? hasEditPermission : true)

  const deleteConfirm = useConfirmDelete(tableName, refetch, primaryKeyColumn, tableMetadata?.singular_label)

  const updateOrder = useUpdateRecord<RecordType>(tableName, primaryKeyColumn)

  // Optimistic ordering applied immediately on drop so the UI doesn't wait for
  // the PATCH round-trip. Held until the server data actually reflects the new
  // order (see reconcile effect below) — NOT cleared on a fixed refetch, because
  // the data API has brief read-after-write lag and an immediate refetch can
  // return the pre-PATCH order, which would make the row snap back.
  const [optimisticData, setOptimisticData] = useState<RecordType[] | null>(null)

  // A drag reorder reuses the page's existing set of order_column values,
  // reassigning them to rows in their new visual order. Because the value SET is
  // unchanged, there are never collisions with other pages and the increment-of-10
  // gaps are preserved. Only rows whose value actually changed are PATCHed.
  const handleReorder = useCallback(
    async ({ orderedRows }: DataTableReorderEvent<RecordType>) => {
      if (!orderColumn) return

      const existingValues = orderedRows
        .map(r => r[orderColumn])
        .filter((v): v is number => typeof v === 'number')

      // Reuse existing values when every row has one; otherwise fall back to a
      // clean 10,20,30,… numbering for this page.
      const targetValues =
        existingValues.length === orderedRows.length
          ? [...existingValues].sort((a, b) => a - b)
          : orderedRows.map((_, i) => (i + 1) * 10)

      const recomputed = orderedRows.map((r, i) => ({
        ...r,
        [orderColumn]: targetValues[i],
      }))
      setOptimisticData(recomputed)

      const updates = orderedRows
        .map((r, i) => ({ row: r, value: targetValues[i] }))
        .filter(u => u.row[orderColumn] !== u.value)

      try {
        await Promise.all(
          updates.map(u =>
            updateOrder.mutateAsync({
              [primaryKeyColumn]: u.row[primaryKeyColumn],
              [orderColumn]: u.value,
            })
          )
        )
        // Nudge a refetch; the reconcile effect drops the optimistic layer once
        // the server returns rows in the new order (it may take an extra refetch
        // due to read-after-write lag — until then the optimistic order stands).
        refetch()
      } catch {
        // Persist failed — revert to whatever the server currently has.
        setOptimisticData(null)
      }
    },
    [orderColumn, primaryKeyColumn, updateOrder, refetch]
  )

  // Any deliberate query change (page/sort/filter/search) must show server data,
  // never a held reorder overlay — drop it whenever the query changes.
  useEffect(() => {
    setOptimisticData(null)
  }, [query])

  // Reconcile the optimistic order with server data. Clear the overlay when the
  // server's row id order matches the optimistic order (the PATCH is now visible),
  // or when membership changed elsewhere (add/delete) so the server should win.
  useEffect(() => {
    if (!optimisticData || !data) return
    const optIds = optimisticData.map(r => String(r[primaryKeyColumn]))
    const dataIds = data.map(r => String(r[primaryKeyColumn]))
    const sameSet =
      optIds.length === dataIds.length &&
      [...optIds].sort().join(' ') === [...dataIds].sort().join(' ')
    if (!sameSet || optIds.join(' ') === dataIds.join(' ')) {
      setOptimisticData(null)
    }
  }, [data, optimisticData, primaryKeyColumn])

  // --- Pagination change: from niko-table pagination component ---
  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      setPaginationState(prev =>
        typeof updater === 'function' ? updater(prev) : updater
      )
    },
    []
  )

  // --- Sorting change: resets to page 0 ---
  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      setSortingState(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        setPaginationState(p => ({ ...p, pageIndex: 0 }))
        return next
      })
    },
    []
  )

  // --- Controlled filter change from DataTableFilterMenu ---
  const handleFiltersChange = useCallback(
    (filters: ExtendedColumnFilter<RecordType>[] | null) => {
      setExtFilters(filters ?? [])
      setPaginationState(p => ({ ...p, pageIndex: 0 }))
    },
    []
  )

  // --- Controlled search change from DataTableSearchFilter ---
  const handleSearchChange = useCallback((value: string) => {
    setSearchText(value)
    setPaginationState(p => ({ ...p, pageIndex: 0 }))
  }, [])

  // Sticky-left pinning target: the entity's label column (and any column to its
  // left) — but only when the label sits in grid position 1 or 2. Keeps the row's
  // human identifier visible while a wide table scrolls horizontally. Computed
  // from metadata (same skip rules as the column build) so it is available while
  // building the columns, where pinned columns need an explicit size + truncation.
  const leftPinnedKeys = useMemo(() => {
    if (!metadata.properties) return [] as string[]
    const keys: string[] = []
    for (const [key, property] of Object.entries(metadata.properties)) {
      if (excludeColumns.includes(key)) continue
      if (key.startsWith('_') || key.endsWith('_at')) continue
      if (property.ctype === 'fk_label' || property.ctype === '_label') continue
      if (key.includes('[[Prototype]]')) continue
      keys.push(key)
    }
    const labelIndex = keys.indexOf(displayColumn)
    return labelIndex === 0 || labelIndex === 1 ? keys.slice(0, labelIndex + 1) : []
  }, [metadata.properties, excludeColumns, displayColumn])

  // --- Column definitions from metadata ---
  const columns = useMemo((): DataTableColumnDef<RecordType>[] => {
    const cols: DataTableColumnDef<RecordType>[] = []
    if (!metadata.properties) return cols

    for (const [key, property] of Object.entries(metadata.properties)) {
      if (excludeColumns.includes(key)) continue
      if (key.startsWith('_') || key.endsWith('_at')) continue
      // Synthetic label companions (get_schema emits fk_label/_label as properties).
      // The owning reference column renders the label, so these must not become
      // their own columns — otherwise each reference shows twice, and the companion
      // column renders the embedded object as "[object Object]".
      if (property.ctype === 'fk_label' || property.ctype === '_label') continue
      if (key.includes('[[Prototype]]')) continue

      // Rich-text and structured-data fields are too large to be useful in a grid cell.
      if (property.format === 'json' || property.format === 'markdown' || property.format === 'html') continue

      const variant = getFilterVariant(property)
      // Numeric columns are right-aligned (cells via text-right below, header via
      // justify-end) so the heading lines up with the right-aligned figures.
      // Reference (FK) and enum columns have a numeric underlying type but render a
      // left-aligned label/badge in the cell — they must NOT get a right-aligned
      // heading. Mirror the cell logic: text-right is only reached when the column
      // is not a reference, not a boolean, and not an enum.
      const isNumeric =
        (property.type === 'integer' || property.type === 'number') &&
        !property.reference_table &&
        !(property.enum && property.enum.length > 0)
      const columnTitle = property.title || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

      const options = property.enum
        ? property.enum.map(v => ({ label: v, value: v }))
        : undefined

      // Sticky-left-pinned columns get a fixed width and always truncate so their
      // content cannot overflow into the next (scrolling) column. Unpinned 'w'
      // columns truncate at a 400px max-width; everything else flows naturally.
      const isPinned = leftPinnedKeys.includes(key)
      const pinnedSize = isPinned ? PINNED_WIDTH_PX[getWidthBucket(property)] : undefined
      const isTruncating = getWidthBucket(property) === 'w'
      const truncateClasses =
        isPinned || isTruncating ? 'whitespace-nowrap overflow-hidden text-ellipsis' : undefined
      // Cap the inner content at the column width (minus cell padding) so the
      // ellipsis lands inside the pinned column rather than under its neighbour.
      const truncateStyle: React.CSSProperties | undefined = isPinned
        ? { maxWidth: pinnedSize! - 24 }
        : isTruncating
          ? { maxWidth: 400 }
          : undefined
      const showTitle = isPinned || isTruncating

      cols.push({
        accessorKey: key,
        // Pinned columns need an explicit width (sticky offsets depend on it);
        // unpinned columns stay size-less so the table distributes widths
        // naturally. The actions column retains size:50 to stay compact.
        ...(pinnedSize ? { size: pinnedSize } : {}),
        enableColumnFilter: true,
        meta: {
          label: columnTitle,
          variant,
          ...(options ? { options } : {}),
        },
        header: ({ column }) => {
          // Show the sort control only when the column is actually sorted — no hover-reveal
          // arrow — consistently for EVERY column format. Titles stay click-to-sort. Numeric
          // columns right-align (so unsorted captions sit flush against the figures); when a
          // numeric column is sorted, a tight (size-5) arrow shows to the right of the caption.
          const showSort = Boolean(column.getIsSorted())
          return (
            <DataTableColumnHeader className={isNumeric ? 'justify-end gap-0.5' : 'justify-start'}>
              <DataTableColumnTitle>{columnTitle}</DataTableColumnTitle>
              {showSort && <DataTableColumnSortMenu className={isNumeric ? 'size-5' : undefined} />}
            </DataTableColumnHeader>
          )
        },
        cell: ({ row }) => {
          const value = row.original[key]

          if (property.reference_table && property.reference_table_label_column) {
            const labelKey = `${key}_label`
            if (AUTO_LABEL) {
              // DB-generated _label column already holds the label string.
              const labelValue = row.original[labelKey]
              const text = String(labelValue || value || '-')
              return <div className={truncateClasses} style={truncateStyle} title={showTitle ? text : undefined}>{text}</div>
            }
            const embedded = row.original[labelKey] as Record<string, unknown> | undefined
            if (embedded && typeof embedded === 'object' && !Array.isArray(embedded)) {
              const labelValue = embedded[property.reference_table_label_column]
              const text = String(labelValue || value || '-')
              return <div className={truncateClasses} style={truncateStyle} title={showTitle ? text : undefined}>{text}</div>
            }
            const text = String(value || '-')
            return <div className={truncateClasses} style={truncateStyle} title={showTitle ? text : undefined}>{text}</div>
          }

          if (property.type === 'boolean') {
            return <Badge variant={value ? 'default' : 'secondary'}>{value ? 'Yes' : 'No'}</Badge>
          }

          if (property.enum && Array.isArray(property.enum)) {
            const sv = String(value || 'unknown')
            return (
              <Badge variant={sv === 'active' ? 'default' : sv === 'inactive' ? 'secondary' : 'outline'}>
                {sv}
              </Badge>
            )
          }

          if (property.type === 'integer' || property.type === 'number') {
            const precision = resolvePrecision(property)
            // Locale-aware number formatting (see lib/number-format.ts). Suppress thousands
            // grouping for the primary-key id column — a grouped id like "1,002" reads wrong.
            return (
              <div className="text-right tabular-nums">
                {formatNumberForDisplay(value, precision, { grouping: key !== primaryKeyColumn })}
              </div>
            )
          }

          if (isDateFormat(property.format)) {
            const text = formatDateForDisplay(value, property.format) || '-'
            return <div className={truncateClasses} style={truncateStyle} title={showTitle ? text : undefined}>{text}</div>
          }

          const text = String(value ?? '-')
          return <div className={truncateClasses} style={truncateStyle} title={showTitle ? text : undefined}>{text}</div>
        },
      })
    }

    // Actions column
    const dataColumnCount = cols.length
    const showRecordIdentifier = dataColumnCount > 4
    cols.push({
      id: 'actions',
      header: '',
      size: 50,
      enableHiding: false,
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }) => {
        const recordId = row.original[primaryKeyColumn]
        const displayValue = row.original[displayColumn]
        const record = row.original
        const handleOpenRecord = (e: React.MouseEvent) => {
          e.stopPropagation()
            ; (onEdit || onEditModal)?.(record)
        }
        const hasOpenHandler = !!(onEdit || onEditModal)
        const extraItems = getRowMenuItems?.(record) ?? []
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={e => e.stopPropagation()}
                />
              }
            >
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48" sideOffset={5}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  Actions
                  {showRecordIdentifier && displayValue != null && String(displayValue) !== '' && (
                    <div className="text-xs font-medium text-foreground mt-0.5 truncate">
                      {String(displayValue)}
                    </div>
                  )}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {hasOpenHandler && (
                <DropdownMenuItem onClick={handleOpenRecord}>
                  {effectiveCanEdit ? (
                    <>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </>
                  )}
                </DropdownMenuItem>
              )}
              {extraItems.length > 0 && hasOpenHandler && <DropdownMenuSeparator />}
              {extraItems.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownMenuItem
                    key={item.key}
                    disabled={item.disabled}
                    className={item.destructive ? 'text-destructive focus:text-destructive focus:bg-destructive/10' : undefined}
                    onClick={e => {
                      e.stopPropagation()
                      item.onClick?.(record)
                    }}
                  >
                    {Icon && <Icon className="mr-2 h-4 w-4" />}
                    {item.label}
                  </DropdownMenuItem>
                )
              })}
              {effectiveCanEdit && (hasOpenHandler || extraItems.length > 0) && <DropdownMenuSeparator />}
              {effectiveCanEdit && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={e => {
                    e.stopPropagation()
                    deleteConfirm.showConfirmation(
                      recordId as string | number,
                      displayValue != null && String(displayValue) !== ''
                        ? String(displayValue)
                        : 'this record'
                    )
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
              {!hasOpenHandler && !effectiveCanEdit && extraItems.length === 0 && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">No actions available</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    })

    // Drag-handle column (leftmost) — only when drag reordering is active.
    if (dndEnabled) {
      cols.unshift({
        id: '__drag',
        header: () => null,
        size: 40,
        enableHiding: false,
        enableSorting: false,
        enableColumnFilter: false,
        cell: () => (
          <div className="flex items-center justify-center">
            <RowDragHandle />
          </div>
        ),
      })
    }

    return cols
  }, [metadata, excludeColumns, effectiveCanEdit, onEdit, editRoute, onEditModal, deleteConfirm, primaryKeyColumn, displayColumn, leftPinnedKeys, dndEnabled, getRowMenuItems])

  // Sticky pinning state: the label column (+ anything left of it, when in
  // position 1 or 2) on the left, and the row-actions column on the right.
  // leftPinnedKeys is in column order, and those columns are sized explicitly in
  // the column build so the sticky offsets stay aligned.
  // The drag handle pins to the far left (ahead of the label column) so it stays
  // the first visible column while a wide table scrolls. It carries an explicit
  // size (40px) so the sticky offsets stay aligned.
  const columnPinning = useMemo(
    () => ({
      left: dndEnabled ? ['__drag', ...leftPinnedKeys] : leftPinnedKeys,
      right: ['actions'],
    }),
    [leftPinnedKeys, dndEnabled]
  )

  // Constrain the whole grid to max-w-[760px] when there are ≤ 4 data columns
  // columns includes the actions column, so threshold is columns.length <= 5.
  // Constrained grids are centered horizontally (mx-auto) rather than left-pinned.
  const isConstrained = columns.length <= 5

  const tableData = useMemo(() => optimisticData ?? data ?? [], [optimisticData, data])

  // Show empty state when first page is empty with no active search/filters
  if (!isLoading && tableData.length === 0 && pagination.pageIndex === 0 && !searchText && extFilters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        {_emptyIcon || <div className="h-12 w-12 mb-2" />}
        <p>{emptyMessage || 'No records found'}</p>
      </div>
    )
  }

  return (
    <>
      <div className={cn("w-full", isConstrained && "mx-auto max-w-[760px]")}>
        <DataTableRoot<RecordType, unknown>
          key={tableName}
          data={tableData}
          columns={columns}
          isLoading={isLoading}
          // Row id keyed off the dynamic primary key (id_column), NOT a literal
          // `id` property. Falls back to the row index when the PK value is
          // missing (e.g. transient placeholder rows) so keys are always unique —
          // a missing fallback produces duplicate keys and breaks reconciliation.
          getRowId={(row, index) => {
            const v = row[primaryKeyColumn]
            return v !== undefined && v !== null ? String(v) : String(index)
          }}
          initialState={{
            // Pin the row-actions column to the right edge so the "..." menu
            // stays visible without scrolling to the end of a wide table, plus
            // the label column (and anything left of it) on the left when it
            // sits in position 1 or 2 — see columnPinning memo above.
            columnPinning,
          }}
          state={{
            pagination,
            sorting,
          }}
          onPaginationChange={handlePaginationChange}
          onSortingChange={handleSortingChange}
          config={{
            manualPagination: true,
            manualSorting: true,
            manualFiltering: true,
            enablePagination: true,
            enableFilters: true,
            enableSorting: true,
            pageCount: totalPages ?? -1,
          }}
        >
          {/* Toolbar */}
          <DataTableToolbarSection className="justify-between">
            <div className="flex flex-1 gap-2">
              {tableMetadata.searchable && (
                <DataTableSearchFilter
                  placeholder={`Search ${tableMetadata.plural_label || 'records'}...`}
                  value={searchText}
                  onChange={handleSearchChange}
                  className="max-w-[400px]"
                />
              )}
            </div>
            <div className="flex gap-2">
              <DataTableSortMenu />
              <DataTableFilterMenu
                filters={extFilters}
                onFiltersChange={handleFiltersChange}
              />
              <DataTableViewMenu />
            </div>
          </DataTableToolbarSection>

          {/* Table */}
          <DataTable>
            <DataTableHeader />
            <DataTableBody<RecordType>
              onRowClick={onRowClick}
              enableRowDnd={dndEnabled}
              onReorder={handleReorder}
            >
              {/* Must be a CHILD of DataTableBody — it renders its children
                  inside <tbody>, so as a sibling of DataTableBody these <tr>s
                  would sit directly under <table>. Self-gating: the skeleton
                  returns null unless the table context says isLoading, the body
                  hides its rows while loading, and the empty body nulls out.
                  `placeholderData` keeps isLoading false on paging/sorting, so
                  this only ever shows on a table's first load. Row height is
                  held by DataTableSkeleton's own line-box wrapper, so nothing
                  jumps when the rows land and no override is needed here. */}
              <DataTableSkeleton rows={pagination.pageSize} />
            </DataTableBody>
            <DataTableEmptyBody />
          </DataTable>

          {/* Pagination */}
          <DataTablePagination
            totalCount={totalCount}
            pageSizeOptions={[10, 15, 20, 25, 30, 40, 50]}
            isLoading={isLoading}
          />
        </DataTableRoot>
      </div>

      <ConfirmDeleteDialog
        {...deleteConfirm}
        entityType={metadata.table?.singular_label || metadata.title || 'Record'}
      />
    </>
  )
}