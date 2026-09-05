import { createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'
import { useTable } from '@/hooks/useTable'
import { useConfirmDelete } from '@/hooks/useConfirmDelete'
import { useUserHasPermission } from '@/hooks/useUserPermissions'
import { ApiErrorDisplay } from '@/components/ApiErrorDisplay'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MoreHorizontal, Pencil, Plus, Trash2, Users, ExternalLink, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Loader2 } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { CustomerForm } from '@/components/customers/CustomerForm'
import { useState } from 'react'

type Customer = Record<string, unknown>

export const Route = createFileRoute('/_app/xcustomers')({
  head: () => ({ meta: [{ title: pageTitle('Customers') }] }),
  component: CustomersComponent,
})

function CustomersComponent() {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const [sorting, setSorting] = useState<SortingState>([])
  const [modalMode, setModalMode] = useState<'edit' | 'create' | null>(null)
  const [modalCustomer, setModalCustomer] = useState<Customer | undefined>(undefined)
  
  // Build PostgREST query params for server-side pagination and sorting
  const buildQuery = () => {
    const params: string[] = []
    
    // Select all columns explicitly
    params.push('select=*')
    
    // Pagination - PostgREST uses limit and offset
    const { pageIndex, pageSize } = pagination
    params.push(`limit=${pageSize}`)
    params.push(`offset=${pageIndex * pageSize}`)
    
    // Sorting - PostgREST format: order=column.asc or order=column.desc
    if (sorting.length > 0) {
      const sortParam = sorting.map(s => `${s.id}.${s.desc ? 'desc' : 'asc'}`).join(',')
      params.push(`order=${sortParam}`)
    }
    
    return params.join('&')
  }
  
  // Fetch table metadata from the tables table first
  const { data: tableMetadata, isLoading: isLoadingMetadata } = useTable('tables', {
    query: 'select=label,description,edit_permission&table_name=eq.customers&limit=1',
  })
  
  // Extract metadata fields
  const metadata = tableMetadata?.[0] as { label?: string; description?: string; edit_permission?: string } | undefined
  console.log()
  // Check if user can edit - call hook unconditionally, then check if permission is required
  const hasEditPermission = useUserHasPermission(metadata?.edit_permission || '')
  const canEdit = metadata?.edit_permission ? hasEditPermission : true
  
  const { data: customers, isLoading, error, refetch } = useTable('customers', {
    query: buildQuery(),
    enabled: !isLoadingMetadata, // Wait for metadata to load first
  })
  
  // Use the reusable delete confirmation hook
  // Note: customers table uses 'customer_id' as the primary key
  const deleteConfirm = useConfirmDelete('customers', refetch, 'customer_id')

  // Parse URL to determine sheet state
  const pathname = routerState.location.pathname
  const isNewMode = pathname === '/xcustomers/new'
  const editMatch = pathname.match(/^\/xcustomers\/([^/]+)\/edit$/)
  const viewMatchResult = pathname.match(/^\/xcustomers\/([^/]+)$/)
  const viewMatch = viewMatchResult && !editMatch ? viewMatchResult : null
  
  const isEditMode = !!editMatch
  const customerId = editMatch?.[1] || viewMatch?.[1]
  const isOpen = isNewMode || !!customerId

  const handleModalOpen = (mode: 'edit' | 'create', customer?: Customer) => {
    setModalMode(mode)
    setModalCustomer(customer)
  }

  const handleModalClose = () => {
    setModalMode(null)
    setModalCustomer(undefined)
    // Refresh the grid
    refetch()
  }

  const handleSort = (columnId: string) => {
    setSorting((old) => {
      const existing = old.find(s => s.id === columnId)
      if (!existing) {
        return [{ id: columnId, desc: false }]
      }
      if (!existing.desc) {
        return [{ id: columnId, desc: true }]
      }
      return []
    })
  }

  const getSortIcon = (columnId: string) => {
    const sort = sorting.find(s => s.id === columnId)
    if (!sort) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
    return sort.desc ? (
      <span className="ml-2">↓</span>
    ) : (
      <span className="ml-2">↑</span>
    )
  }

  const columns: ColumnDef<Customer>[] = [
    {
      accessorKey: 'email',
      header: () => (
        <Button
          variant="ghost"
          onClick={() => handleSort('email')}
          className="hover:bg-transparent p-0 h-auto font-medium"
        >
          Email Address
          {getSortIcon('email')}
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium">{String(row.original.email || '-')}</div>
      ),
    },
    {
      accessorKey: 'phone',
      header: () => (
        <Button
          variant="ghost"
          onClick={() => handleSort('phone')}
          className="hover:bg-transparent p-0 h-auto font-medium"
        >
          Phone Number
          {getSortIcon('phone')}
        </Button>
      ),
      cell: ({ row }) => String(row.original.phone || '-'),
    },
    {
      accessorKey: 'company',
      header: () => (
        <Button
          variant="ghost"
          onClick={() => handleSort('company')}
          className="hover:bg-transparent p-0 h-auto font-medium"
        >
          Company Name
          {getSortIcon('company')}
        </Button>
      ),
      cell: ({ row }) => String(row.original.company || '-'),
    },
    {
      accessorKey: 'status',
      header: () => (
        <Button
          variant="ghost"
          onClick={() => handleSort('status')}
          className="hover:bg-transparent p-0 h-auto font-medium"
        >
          Status
          {getSortIcon('status')}
        </Button>
      ),
      cell: ({ row }) => {
        const status = String(row.original.status || 'unknown')
        return (
          <Badge
            variant={
              status === 'active'
                ? 'default'
                : status === 'inactive'
                  ? 'secondary'
                  : 'outline'
            }
          >
            {status}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'total_orders',
      header: () => (
        <Button
          variant="ghost"
          onClick={() => handleSort('total_orders')}
          className="hover:bg-transparent p-0 h-auto font-medium"
        >
          Total Orders
          {getSortIcon('total_orders')}
        </Button>
      ),
      cell: ({ row }) => String(row.original.total_orders || '0'),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const customerId = row.original.id
        const customer = row.original
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
              {canEdit && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate({
                        to: '/xcustomers/$id/edit',
                        params: { id: String(customerId) },
                      })
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit in Sidebar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      handleModalOpen('edit', customer)
                    }}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Edit in Modal
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConfirm.showConfirmation(
                        customer.customer_id as string | number,
                        String(customer.customer_name || customer.email || customer.company || 'this customer')
                      )
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
              {!canEdit && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No actions available
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  // For server-side pagination, we manage pagination manually
  const table = useReactTable({
    data: customers || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: -1, // We don't know total pages without count query
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
  })

  const handleRowClick = (customer: Customer) => {
    navigate({
      to: '/xcustomers/$id',
      params: { id: String(customer.id) },
    })
  }

  const handleSheetClose = () => {
    navigate({ to: '/xcustomers' })
    // Refresh the grid
    refetch()
  }

  const selectedCustomer = customerId
    ? customers?.find((c) => String(c.id) === String(customerId))
    : undefined

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {metadata?.label || 'Customers'}
          </h1>
          <p className="text-muted-foreground">
            {metadata?.description || 'Manage customer information and orders'}
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => navigate({ to: '/xcustomers/new' })}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <CardTitle>Customer List</CardTitle>
          </div>
          <CardDescription>
            Browse and manage all customer records
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">
                Loading customers...
              </span>
            </div>
          )}

          {error && (
            <ApiErrorDisplay error={error} title="Error loading customers" />
          )}

          {!isLoading && !error && customers && customers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mb-2" />
              <p>No customers found</p>
              {canEdit && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => navigate({ to: '/xcustomers/new' })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add your first customer
                </Button>
              )}
            </div>
          )}

          {!isLoading && !error && customers && customers.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      onClick={() => handleRowClick(row.original)}
                      className="cursor-pointer hover:bg-muted/50 transition-colors duration-200"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination controls */}
          {!isLoading && !error && customers && customers.length > 0 && (
            // 1.4.10 Reflow: a single non-wrapping flex line put the page controls
            // ~63px past the card's right edge at 390px, with no scrollable
            // ancestor to reach them.
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-2 py-4">
              <div className="text-sm text-muted-foreground">
                Showing {pagination.pageIndex * pagination.pageSize + 1} to{' '}
                {Math.min(
                  (pagination.pageIndex + 1) * pagination.pageSize,
                  (customers?.length || 0) + pagination.pageIndex * pagination.pageSize
                )}{' '}
                customers
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:gap-x-8">
                <div className="flex items-center space-x-2">
                  {/* The adjacent <p> looked like a label but was not one — a
                      <select> with no label announces as an unnamed combo box
                      (4.1.2). Promoting it to a real <label htmlFor> costs
                      nothing and keeps the same visual. */}
                  <label htmlFor="xcustomers-page-size" className="text-sm font-medium">
                    Rows per page
                  </label>
                  <select
                    id="xcustomers-page-size"
                    value={pagination.pageSize}
                    onChange={(e) => {
                      setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })
                    }}
                    className="h-8 w-[70px] rounded-md border border-input-border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                      <option key={pageSize} value={pageSize}>
                        {pageSize}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-center text-sm font-medium whitespace-nowrap">
                  Page {pagination.pageIndex + 1}
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
                    onClick={() => setPagination({ ...pagination, pageIndex: pagination.pageIndex - 1 })}
                    disabled={pagination.pageIndex === 0}
                  >
                    <span className="sr-only">Go to previous page</span>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => setPagination({ ...pagination, pageIndex: pagination.pageIndex + 1 })}
                    disabled={!customers || customers.length < pagination.pageSize}
                  >
                    <span className="sr-only">Go to next page</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="hidden h-8 w-8 p-0 lg:flex"
                    onClick={() => setPagination({ ...pagination, pageIndex: pagination.pageIndex + 1 })}
                    disabled={!customers || customers.length < pagination.pageSize}
                  >
                    <span className="sr-only">Go to last page (approx)</span>
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sheet for viewing/editing customer - responsive: full screen on mobile */}
      <Sheet open={isOpen} onOpenChange={(open) => !open && handleSheetClose()}>
        <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-[540px] overflow-y-auto border-l-0">
          <CustomerForm
            customer={selectedCustomer}
            mode={isNewMode ? 'create' : isEditMode ? 'edit' : 'view'}
            onClose={handleSheetClose}
            displayMode="sidebar"
          />
        </SheetContent>
      </Sheet>

      {/* Modal for editing customer - responsive: full screen on mobile */}
      <Dialog open={!!modalMode} onOpenChange={(open) => !open && handleModalClose()}>
        <DialogContent className="w-full max-w-[90vw] sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <CustomerForm
            customer={modalCustomer}
            mode={modalMode || 'edit'}
            onClose={handleModalClose}
            displayMode="modal"
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <ConfirmDeleteDialog {...deleteConfirm} entityType="Customer" />
    </div>
  )
}
