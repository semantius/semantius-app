import { useState, useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { type EntityMetadata, type TableMetadata } from '@/types/metadata'
import { useTable } from '@/hooks/useTable'
import { useConfirmDelete } from '@/hooks/useConfirmDelete'
import { useUserHasPermission } from '@/hooks/useUserPermissions'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { buildPostgRESTSelect, AUTO_LABEL } from '@/lib/apiClient'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  Trash2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
} from 'lucide-react'

type Record = {
  [key: string]: unknown
}

export interface PaginationState {
  pageIndex: number
  pageSize: number
}

export interface TableViewProps {
  metadata: EntityMetadata
  onRowClick?: (record: Record) => void
  onEdit?: (record: Record) => void
  onEditModal?: (record: Record) => void
  editRoute?: string
  canEdit?: boolean
  emptyMessage?: string
  emptyIcon?: React.ReactNode
  excludeColumns?: string[]
}

export function TableView({
  metadata,
  onRowClick,
  onEdit,
  onEditModal,
  editRoute,
  canEdit = true,
  emptyMessage,
  emptyIcon,
  excludeColumns = [],
}: TableViewProps) {
  // Extract table configuration from metadata
  const tableMetadata = metadata.table as TableMetadata | undefined
  
  if (!tableMetadata) {
    throw new Error('TableView requires metadata.table to be defined')
  }
  if (!tableMetadata.table_name) {
    throw new Error('TableView requires metadata.table.table_name to be defined')
  }
  if (!tableMetadata.id_column) {
    throw new Error('TableView requires metadata.table.id_column to be defined')
  }
  if (!tableMetadata.label_column) {
    throw new Error('TableView requires metadata.table.label_column to be defined')
  }
  
  const tableName = tableMetadata.table_name
  const primaryKeyColumn = tableMetadata.id_column
  const displayColumn = tableMetadata.label_column

  // Use fine-grained selector with structural sharing to prevent unnecessary re-renders
  const searchParams = useSearch({
    strict: false,
    select: (search) => ({
      page: (search as { page?: number }).page,
      pageSize: (search as { pageSize?: number }).pageSize,
      sortBy: (search as { sortBy?: string }).sortBy,
      sortOrder: (search as { sortOrder?: 'asc' | 'desc' }).sortOrder,
    }),
    structuralSharing: true,
  })

  // Calculate default page size based on viewport height (only on mount)
  // This adjusts the initial pagination to show more rows on larger screens
  const getDefaultPageSize = () => {
    const height = window.innerHeight
    if (height > 1330) return 20
    if (height > 1070) return 15
    return 10
  }

  // Initialize state from URL parameters (only on mount)
  const [pagination, setPagination] = useState<PaginationState>(() => ({
    pageIndex: searchParams.page ? searchParams.page - 1 : 0,
    pageSize: searchParams.pageSize || getDefaultPageSize(),
  }))
  const [sorting, setSorting] = useState<SortingState>(() => {
    // Validate that sortBy column exists in metadata before using it
    // This prevents errors when navigating between tables with different schemas
    const sortByColumn = searchParams.sortBy
    const columnExists = sortByColumn && metadata.properties?.[sortByColumn]
    
    return columnExists
      ? [{ id: sortByColumn, desc: searchParams.sortOrder === 'desc' }]
      : [{ id: primaryKeyColumn, desc: true }]
  })
  const [pageInputValue, setPageInputValue] = useState<string>(String((searchParams.page || 1)))

  const navigate = useNavigate()

  // Reset state when table changes (navigating between different tables)
  // This ensures each table starts with fresh pagination/sorting state
  useEffect(() => {
    setPagination({
      pageIndex: searchParams.page ? searchParams.page - 1 : 0,
      pageSize: searchParams.pageSize || getDefaultPageSize(),
    })
    
    // Validate that sortBy column exists in the new table's metadata
    const sortByColumn = searchParams.sortBy
    const columnExists = sortByColumn && metadata.properties?.[sortByColumn]
    
    setSorting(
      columnExists
        ? [{ id: sortByColumn, desc: searchParams.sortOrder === 'desc' }]
        : [{ id: primaryKeyColumn, desc: true }]
    )
    
    setPageInputValue(String((searchParams.page || 1)))
  }, [tableName, searchParams.page, searchParams.pageSize, searchParams.sortBy, searchParams.sortOrder, primaryKeyColumn, metadata.properties])

  // Sync pageInputValue when pagination changes
  useEffect(() => {
    setPageInputValue(String(pagination.pageIndex + 1))
  }, [pagination.pageIndex])

  // Sync URL when state changes - only if values actually differ
  useEffect(() => {
    const currentPage = searchParams.page || 1
    const currentPageSize = searchParams.pageSize || 10
    const currentSortBy = searchParams.sortBy
    const currentSortOrder = searchParams.sortOrder || 'asc'

    const targetPage = pagination.pageIndex + 1
    const targetPageSize = pagination.pageSize
    const targetSortBy = sorting[0]?.id
    const targetSortOrder = sorting[0]?.desc ? 'desc' : 'asc'

    // Only navigate if values actually changed
    if (
      currentPage === targetPage &&
      currentPageSize === targetPageSize &&
      currentSortBy === targetSortBy &&
      currentSortOrder === targetSortOrder
    ) {
      return
    }

    navigate({
      search: (prev: any) => ({
        ...prev,
        page: targetPage,
        pageSize: targetPageSize,
        ...(targetSortBy ? { sortBy: targetSortBy, sortOrder: targetSortOrder } : {}),
      }),
      replace: true,
      resetScroll: false,
    } as any)
  }, [pagination.pageIndex, pagination.pageSize, sorting, searchParams.page, searchParams.pageSize, searchParams.sortBy, searchParams.sortOrder, navigate])

  // Build PostgREST query params for server-side pagination and sorting
  const buildQuery = () => {
    const params: string[] = []
    
    // Build select clause with embedded resources for foreign key references
    // This allows us to fetch and display label values instead of just IDs
    const selectClause = buildPostgRESTSelect(metadata)
    params.push(`select=${selectClause}`)
    
    // Pagination - PostgREST uses limit and offset
    const { pageIndex, pageSize } = pagination
    params.push(`limit=${pageSize}`)
    params.push(`offset=${pageIndex * pageSize}`)
    
    // Sorting - PostgREST format: order=column.asc or order=column.desc
    // Note: PostgREST doesn't support sorting by aliased embedded resources,
    // so reference fields will sort by ID. For label-based sorting, use database views.
    if (sorting.length > 0) {
      const sortParam = sorting.map(s => {
        // Sort by the actual column (which is the ID for reference fields)
        return `${s.id}.${s.desc ? 'desc' : 'asc'}`
      }).join(',')
      params.push(`order=${sortParam}`)
    }
    
    return params.join('&')
  }

  // Fetch data using useTable hook with total count
  const { data, totalCount, isLoading, error, refetch } = useTable(tableName, {
    query: buildQuery(),
    count: true, // Enable total count for pagination
    // Keep previous data while loading to prevent flickering
    placeholderData: (previousData) => previousData,
  })
  
  // Calculate total pages
  const totalPages = totalCount ? Math.ceil(totalCount / pagination.pageSize) : undefined

  // Throw errors so they bubble up to error boundary
  if (error) throw error

  // Check edit permission if metadata provides it
  const hasEditPermission = useUserHasPermission(
    tableMetadata?.edit_permission || ''
  )
  const effectiveCanEdit =
    canEdit &&
    (tableMetadata?.edit_permission
      ? hasEditPermission
      : true)

  // Use the reusable delete confirmation hook
  const deleteConfirm = useConfirmDelete(tableName, refetch, primaryKeyColumn)

  const handleSort = (columnId: string) => {
    const existing = sorting.find((s) => s.id === columnId)
    if (!existing) {
      setSorting([{ id: columnId, desc: false }])
    } else if (!existing.desc) {
      setSorting([{ id: columnId, desc: true }])
    } else {
      setSorting([])
    }
  }

  const getSortIcon = (columnId: string) => {
    const sort = sorting.find((s) => s.id === columnId)
    if (!sort) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
    return sort.desc ? (
      <span className="ml-2">↓</span>
    ) : (
      <span className="ml-2">↑</span>
    )
  }

  // Generate columns from metadata.properties (JSON Schema)
  const generateColumns = (): ColumnDef<Record>[] => {
    const cols: ColumnDef<Record>[] = []

    if (!metadata.properties) {
      return cols
    }

    // Get required fields
    const requiredFields = metadata.required || []

    // Render properties in the order they appear in metadata
    for (const [key, property] of Object.entries(metadata.properties)) {
      // Skip excluded columns
      if (excludeColumns.includes(key)) continue

      // Skip internal/system fields like _internal_flag, created_at, updated_at
      // NOTE: We do NOT filter out 'id' or other columns here - the metadata schema
      // is the source of truth for what columns exist and should be displayed.
      // If a column shouldn't appear, it should either:
      // 1. Not be included in the metadata schema properties, OR
      // 2. Be passed in the excludeColumns prop for view-specific hiding
      if (key.startsWith('_') || key.endsWith('_at')) continue

      // Synthetic label companions (get_schema emits fk_label/_label as properties).
      // The owning reference column renders the label, so these must not become
      // their own columns — otherwise each reference shows twice, and the companion
      // column renders the embedded object as "[object Object]".
      if (property.ctype === 'fk_label' || property.ctype === '_label') continue

      // Skip columns with [[Prototype]] in the key (not real columns)
      if (key.includes('[[Prototype]]')) continue

      const isRequired = requiredFields.includes(key)
      const columnTitle = property.title || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

      cols.push({
        accessorKey: key,
        header: () => (
          <Button
            variant="ghost"
            onClick={() => handleSort(key)}
            className="hover:bg-transparent h-auto font-medium p-0! group"
          >
            {columnTitle}
            {getSortIcon(key)}
          </Button>
        ),
        cell: ({ row }) => {
          const value = row.original[key]

          // Handle foreign key references - show label from aliased _label field
          // PostgREST query uses aliasing: field_name_label:table!field_name(label_column)
          // PostgREST returns this as an object: { category_id: 3, category_id_label: { category_name: "Tools" } }
          // We need to extract the label value from the embedded object
          if (property.reference_table && property.reference_table_label_column) {
            const labelKey = `${key}_label`
            if (AUTO_LABEL) {
              // DB-generated _label column already holds the label string.
              const labelValue = row.original[labelKey]
              return <div className={isRequired ? 'font-medium' : ''}>{String(labelValue || value || '-')}</div>
            }
            const embeddedData = row.original[labelKey] as { [key: string]: unknown } | undefined
            // Extract the label value from the embedded object
            if (embeddedData && typeof embeddedData === 'object' && !Array.isArray(embeddedData)) {
              const labelValue = embeddedData[property.reference_table_label_column]
              return <div className={isRequired ? 'font-medium' : ''}>{String(labelValue || value || '-')}</div>
            }
            // Fallback to ID if embedded data is missing
            return <div className={isRequired ? 'font-medium' : ''}>{String(value || '-')}</div>
          }

          // Handle different property types
          if (property.type === 'boolean') {
            return (
              <Badge variant={value ? 'default' : 'secondary'}>
                {value ? 'Yes' : 'No'}
              </Badge>
            )
          }

          // Handle enum/status fields
          if (property.enum && Array.isArray(property.enum)) {
            const stringValue = String(value || 'unknown')
            return (
              <Badge
                variant={
                  stringValue === 'active'
                    ? 'default'
                    : stringValue === 'inactive'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {stringValue}
              </Badge>
            )
          }

          // Handle integer/number
          if (property.type === 'integer' || property.type === 'number') {
            return <div className="text-right">{String(value || '0')}</div>
          }

          // Handle string (default)
          return <div className={isRequired ? 'font-medium' : ''}>{String(value || '-')}</div>
        },
      })
    }

    // Add actions column
    cols.push({
      id: 'actions',
      header: '',
      size: 50,
      cell: ({ row }) => {
        const recordId = row.original[primaryKeyColumn]
        const displayValue = row.original[displayColumn]
        const record = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48" sideOffset={5}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {effectiveCanEdit && (
                <>
                  {onEdit && editRoute && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(record)
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit in Sidebar
                    </DropdownMenuItem>
                  )}
                  {onEditModal && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditModal(record)
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Edit in Modal
                    </DropdownMenuItem>
                  )}
                  {(onEdit || onEditModal) && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConfirm.showConfirmation(
                        recordId as string | number,
                        String(displayValue || recordId || 'this record')
                      )
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
              {!effectiveCanEdit && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No actions available
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    })

    return cols
  }

  const columns = generateColumns()

  // For server-side pagination, we manage pagination manually
  const table = useReactTable({
    data: data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages ?? -1,
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
  })
  
  // Check if we can go to next page
  const canGoNext = totalPages ? pagination.pageIndex < totalPages - 1 : (data && data.length >= pagination.pageSize)

  const handleRowClickInternal = (record: Record) => {
    if (onRowClick) {
      onRowClick(record)
    }
  }

  // Show empty state only on first page with no data
  if (!isLoading && (!data || data.length === 0) && pagination.pageIndex === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        {emptyIcon || <div className="h-12 w-12 mb-2" />}
        <p>{emptyMessage || 'No records found'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border relative">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header, index) => (
                  <TableHead key={header.id} className={`font-semibold text-foreground px-4 ${index === 0 ? 'pl-6' : ''}`}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No more results
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => handleRowClickInternal(row.original)}
                  className="cursor-pointer hover:bg-muted/50 transition-colors duration-200"
                >
                  {row.getVisibleCells().map((cell, index) => (
                    <TableCell key={cell.id} className={`px-4 ${index === 0 ? 'pl-6' : ''}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-end px-2 py-4">
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Rows per page</p>
            <select
              value={pagination.pageSize}
              onChange={(e) => {
                setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })
              }}
              className="h-8 w-[70px] rounded-md border border-input-border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {[10, 15, 20, 25, 30, 40, 50].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Page</p>
            <input
              type="number"
              min="1"
              max={totalPages || 999}
              value={pageInputValue}
              onChange={(e) => {
                setPageInputValue(e.target.value)
              }}
              onBlur={(e) => {
                const page = Number(e.target.value)
                const maxPage = totalPages || 999
                if (page >= 1 && page <= maxPage) {
                  setPagination({ ...pagination, pageIndex: page - 1 })
                } else {
                  // Reset to current page if invalid
                  setPageInputValue(String(pagination.pageIndex + 1))
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const page = Number((e.target as HTMLInputElement).value)
                  const maxPage = totalPages || 999
                  if (page >= 1 && page <= maxPage) {
                    setPagination({ ...pagination, pageIndex: page - 1 })
                  } else {
                    // Reset to current page if invalid
                    setPageInputValue(String(pagination.pageIndex + 1))
                  }
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              className="h-8 w-[60px] rounded-md border border-input bg-background px-2 py-1 text-sm text-center ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            {totalPages && (
              <p className="text-sm font-medium">of {totalPages}</p>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => setPagination({ ...pagination, pageIndex: 0 })}
              disabled={pagination.pageIndex === 0}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() =>
                setPagination({ ...pagination, pageIndex: pagination.pageIndex - 1 })
              }
              disabled={pagination.pageIndex === 0}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() =>
                setPagination({ ...pagination, pageIndex: pagination.pageIndex + 1 })
              }
              disabled={!canGoNext}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => {
                if (totalPages) {
                  setPagination({ ...pagination, pageIndex: totalPages - 1 })
                }
              }}
              disabled={!totalPages || pagination.pageIndex >= totalPages - 1}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDeleteDialog
        {...deleteConfirm}
        entityType={metadata.table?.singular_label || metadata.title || 'Record'}
      />
    </div>
  )
}
