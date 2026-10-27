import { describe, it, expect } from 'vitest'
import { translate } from '@/i18n'
import { sidebarSortKey, sortSidebarEntities } from './sidebarEntities'

describe('sidebarSortKey', () => {
  it('ranks by entity_type when name_sort is empty', () => {
    expect(sidebarSortKey({ name_sort: '', entity_type: 'operational_workflow' }, 'Orders')).toBe('10Orders')
    expect(sidebarSortKey({ name_sort: '', entity_type: 'operational_record' }, 'Customers')).toBe('10Customers')
    expect(sidebarSortKey({ name_sort: '', entity_type: 'catalog' }, 'Products')).toBe('80Products')
    expect(sidebarSortKey({ name_sort: '', entity_type: 'junction' }, 'Links')).toBe('90Links')
    expect(sidebarSortKey({ name_sort: '', entity_type: 'unclassified' }, 'Misc')).toBe('90Misc')
    expect(sidebarSortKey({}, 'Misc')).toBe('90Misc')
  })

  it('uses name_sort in place of the rank when it is set', () => {
    expect(sidebarSortKey({ name_sort: '05', entity_type: 'catalog' }, 'Products')).toBe('05Products')
  })
})

describe('sortSidebarEntities', () => {
  it('lists operational entities, then catalogs, then the rest, by label within each', () => {
    const entities = [
      { table_name: 'regions', plural_label: 'Regions', name_sort: '', entity_type: 'catalog' },
      { table_name: 'misc', plural_label: 'Misc', name_sort: '', entity_type: 'unclassified' },
      { table_name: 'orders', plural_label: 'Orders', name_sort: '', entity_type: 'operational_workflow' },
      { table_name: 'customers', plural_label: 'Customers', name_sort: '', entity_type: 'operational_record' },
      { table_name: 'categories', plural_label: 'Categories', name_sort: '', entity_type: 'catalog' },
      { table_name: 'pinned', plural_label: 'Pinned', name_sort: '01', entity_type: 'catalog' },
    ]
    const sorted = sortSidebarEntities(entities, null, translate, 'en-US')
    expect(sorted.map((e) => e.label)).toEqual([
      'Pinned',
      'Customers',
      'Orders',
      'Categories',
      'Regions',
      'Misc',
    ])
  })
})
