import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Column } from '@tanstack/react-table'
import { TableColumnTitle } from './table-column-title'

const column = {
  id: 'id',
  columnDef: { meta: { label: 'Id' } },
} as Column<{ id: number }, unknown>

describe('TableColumnTitle', () => {
  it('lets className override the default text-left on the sort button', () => {
    render(
      <TableColumnTitle
        column={column}
        title="Id"
        onClick={() => {}}
        className="text-right"
      />,
    )
    const button = screen.getByRole('button', { name: 'Id' })
    expect(button.className.split(/\s+/)).toContain('text-right')
    expect(button.className.split(/\s+/)).not.toContain('text-left')
  })

  it('keeps text-left on a sortable title when no alignment is passed', () => {
    render(
      <TableColumnTitle column={column} title="Name" onClick={() => {}} />,
    )
    const button = screen.getByRole('button', { name: 'Name' })
    expect(button.className.split(/\s+/)).toContain('text-left')
  })
})
