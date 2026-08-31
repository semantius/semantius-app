import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  DataTable,
  DataTableBody,
  DataTableHeader,
  DataTableRoot,
  DataTableSkeleton,
} from './index'
import type { DataTableColumnDef } from '../types'

type Row = { name: string; email: string; role: string }

const columns: DataTableColumnDef<Row>[] = [
  { id: 'name', accessorKey: 'name', header: 'Name' },
  { id: 'email', accessorKey: 'email', header: 'Email' },
  { id: 'role', accessorKey: 'role', header: 'Role' },
]

function renderGrid(isLoading: boolean) {
  return render(
    <DataTableRoot<Row, unknown> columns={columns} data={[]} isLoading={isLoading}>
      <DataTable>
        <DataTableHeader />
        <DataTableBody<Row>>
          <DataTableSkeleton rows={4} />
        </DataTableBody>
      </DataTable>
    </DataTableRoot>,
  )
}

describe('DataTableSkeleton', () => {
  it('renders one skeleton cell per visible column, inside <tbody>', () => {
    const { container } = renderGrid(true)

    const tbody = container.querySelector('tbody')!
    expect(tbody.querySelectorAll('tr')).toHaveLength(4)
    expect(tbody.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4 * columns.length)

    // Guards the nesting the skeleton exists to get right: rows must never be
    // direct children of <table> (see the comment at its call site in
    // components/data-table-view/DataTableView.tsx).
    expect(container.querySelectorAll('table > tr')).toHaveLength(0)
  })

  it('renders nothing once loading is done', () => {
    const { container } = renderGrid(false)

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
  })
})
