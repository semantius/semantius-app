import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  DataTable,
  DataTableBody,
  DataTableHeader,
  DataTableRoot,
} from './index'
import type { DataTableColumnDef } from '../types'

type Row = { id: number; name: string }

const NUMERIC_MAX = 160

const columns: DataTableColumnDef<Row>[] = [
  {
    id: 'id',
    accessorKey: 'id',
    header: 'Id',
    meta: { label: 'Id', align: 'end', maxWidth: NUMERIC_MAX },
    cell: ({ getValue }) => (
      <div className="w-full text-right tabular-nums">{String(getValue())}</div>
    ),
  },
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Name',
    meta: { label: 'Name' },
  },
]

const data: Row[] = [
  { id: 12, name: 'A reasonably long name so the text column wants the leftover width' },
]

function renderGrid() {
  return render(
    <div style={{ width: 1280 }}>
      <DataTableRoot<Row, unknown> columns={columns} data={data}>
        <DataTable>
          <DataTableHeader />
          <DataTableBody<Row> />
        </DataTable>
      </DataTableRoot>
    </div>,
  )
}

function columnAt(index: number) {
  const header = screen.getAllByRole('columnheader')[index]
  const cell = within(screen.getAllByRole('row')[1]).getAllByRole('cell')[index]
  return { header, cell }
}

describe('numeric column layout', () => {
  it('right-aligns and caps a column that sets align=end and maxWidth', () => {
    renderGrid()

    const numeric = columnAt(0)
    const text = columnAt(1)

    expect(getComputedStyle(numeric.header).textAlign).toBe('right')
    expect(getComputedStyle(numeric.cell).textAlign).toBe('right')
    expect(numeric.header.style.maxWidth).toBe(`${NUMERIC_MAX}px`)
    expect(numeric.cell.style.maxWidth).toBe(`${NUMERIC_MAX}px`)

    expect(getComputedStyle(text.header).textAlign).not.toBe('right')
    expect(text.header.style.maxWidth).toBe('')
    expect(text.cell.style.maxWidth).toBe('')

    expect(numeric.header.getBoundingClientRect().width).toBeLessThanOrEqual(NUMERIC_MAX)
    expect(numeric.cell.getBoundingClientRect().width).toBeLessThanOrEqual(NUMERIC_MAX)
    expect(text.header.getBoundingClientRect().width).toBeGreaterThan(NUMERIC_MAX)
  })
})
