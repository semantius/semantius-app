import { describe, it, expect } from 'vitest'
import { getModuleDisplay, type Module } from './AuthContext'

/**
 * The two-line label rule for a module, on its own.
 *
 * It lived only inside `ModuleSwitcher.test.tsx` before, where it was checked
 * through a mocked `useTable` — so the rule and the component's wiring failed
 * together and neither said which had broken. The rule is a pure function of a
 * row: it belongs here, in the `node` project, with nothing rendered.
 *
 * Passing plain objects to a pure function is not a substitution: there is no
 * collaborator to replace, and the row shape is `Module` as declared beside the
 * function. `ModuleSwitcher.test.tsx` covers the other half — that the component
 * shows what this returns for the tenant's actual rows.
 */

function row(overrides: Partial<Module> = {}): Module {
  return {
    id: 1,
    module_name: 'Sales',
    description: 'Pipeline and quotes',
    module_slug: 'sales',
    alias: '',
    logo_url: null,
    icon_name: null,
    home_page: '/sales',
    created_at: '',
    updated_at: '',
    logo_color: null,
    view_permission: '',
    edit_permission: '',
    dashboard_config: null,
    ...overrides,
  }
}

describe('getModuleDisplay', () => {
  it('puts the name on top and the description below', () => {
    expect(getModuleDisplay(row())).toEqual({
      displayName: 'Sales',
      displayTitle: 'Pipeline and quotes',
    })
  })

  it('shows the description alone for an underscore-prefixed internal module', () => {
    // `_core` is the platform's own module; its name is an identifier, not a
    // label, so the description is all the user should see.
    expect(getModuleDisplay(row({ module_name: '_core', description: 'Administration' }))).toEqual({
      displayName: 'Administration',
      displayTitle: '',
    })
  })

  it('falls back to the name when an internal module has no description', () => {
    expect(getModuleDisplay(row({ module_name: '_core', description: '' }))).toEqual({
      displayName: '_core',
      displayTitle: '',
    })
  })

  it('promotes the description when it already begins with the module name', () => {
    // "Northwind" / "Northwind Sample Database" would otherwise read as a
    // stutter across the two lines.
    expect(
      getModuleDisplay(row({ module_name: 'Northwind', description: 'Northwind Sample Database' })),
    ).toEqual({ displayName: 'Northwind Sample Database', displayTitle: '' })
  })

  it('keeps both lines when the description merely mentions the name later', () => {
    expect(getModuleDisplay(row({ module_name: 'CRM', description: 'Records for CRM' }))).toEqual({
      displayName: 'CRM',
      displayTitle: 'Records for CRM',
    })
  })

  it('shows the name alone when there is no description at all', () => {
    expect(getModuleDisplay(row({ description: '' }))).toEqual({
      displayName: 'Sales',
      displayTitle: '',
    })
  })
})
