import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewSkeleton } from './ViewSkeleton'
import type { EntityMetadata } from '@/types/metadata'

const skeletons = (c: HTMLElement) => c.querySelectorAll('[data-slot="skeleton"]')

describe('ViewSkeleton', () => {
  it('renders a fully generic placeholder without metadata (the route pendingComponent path)', () => {
    const { container } = render(<ViewSkeleton />)

    // Title and description are bars, not text — nothing is known yet.
    expect(container.querySelector('h1')).toBeNull()
    expect(skeletons(container).length).toBeGreaterThan(0)
  })

  it('renders the real title and description when metadata is available', () => {
    const metadata: EntityMetadata = {
      table: {
        table_name: 'customers',
        module_slug: 'crm',
        singular: 'customer',
        plural: 'customers',
        singular_label: 'Customer',
        plural_label: 'Customers',
        description: 'People who buy things',
        id_column: 'id',
        label_column: 'name',
      },
    }

    render(<ViewSkeleton metadata={metadata} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Customers')
    expect(screen.getByText('People who buy things')).toBeInTheDocument()
  })

  it('derives the column count from metadata, applying the grid skip rules', () => {
    const metadata: EntityMetadata = {
      properties: {
        id: { type: 'integer', format: 'int32' },
        name: { type: 'string', format: 'text' },
        status: { type: 'string', format: 'text' },
        // Skipped, exactly as the real grid skips them.
        _label: { type: 'string', format: 'text', ctype: '_label' },
        owner_id_label: { type: 'string', format: 'text', ctype: 'fk_label' },
        created_at: { type: 'string', format: 'date-time' },
        // Skipped because the registry entry says `gridColumn: false`, which is
        // the same list the grid itself reads. (This fixture used `markdown`,
        // which is not a catalog format at all — the old skip list named it and
        // nothing could ever have produced it.)
        notes: { type: 'string', format: 'html' },
      },
    }

    const { container } = render(<ViewSkeleton metadata={metadata} />)

    // 3 kept columns (id, name, status) × (1 header + 8 body rows).
    // created_at is skipped by the audit-column rule, not the format rule.
    expect(skeletons(container)).toHaveLength(3 * 9 + TRIM_SKELETONS)
  })

  it('caps the column count so a wide entity does not overflow the row', () => {
    const properties: EntityMetadata['properties'] = {}
    for (let i = 0; i < 30; i++) properties[`col_${i}`] = { type: 'string', format: 'text' }

    const { container } = render(<ViewSkeleton metadata={{ properties }} />)

    expect(skeletons(container)).toHaveLength(8 * 9 + TRIM_SKELETONS)
  })
})

// Breadcrumb (3) + the primary-action button (1) + toolbar search and its three
// menu buttons (4) are always bars, with or without metadata.
const TRIM_SKELETONS = 8
