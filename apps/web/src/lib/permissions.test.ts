import { describe, expect, it } from 'vitest'
import { canEditEntity, hasAllPermissions, hasAnyPermission, hasPermission, permissionsOf } from './permissions'

/**
 * Runs in `node`. The previous version of these tests built a full
 * `AuthContextType` by hand, rendered it through a real `AuthContext.Provider`
 * and asserted the hook read it back — a lot of machinery to check that React
 * context works, and it covered only ONE of the module's three rules. As pure
 * functions all four are covered, including the cases the server can actually
 * produce: not loaded yet, no `permissions` key, and a `permissions` that is not
 * a list.
 */
describe('permission rules', () => {
  const admin = { permissions: ['customers.edit', 'customers.delete'] }

  describe('permissionsOf', () => {
    it.each([
      ['not loaded yet', null],
      ['undefined', undefined],
      ['no permissions key', { email: 'test@example.com' }],
      ['permissions is a string', { permissions: 'not-an-array' }],
      ['permissions is an object', { permissions: { edit: true } }],
    ])('is empty when %s', (_label, input) => {
      expect(permissionsOf(input as never)).toEqual([])
    })

    it('is the list when there is one', () => {
      expect(permissionsOf(admin)).toEqual(['customers.edit', 'customers.delete'])
    })
  })

  describe('hasPermission', () => {
    it('is true for a permission the user holds', () => {
      expect(hasPermission(admin, 'customers.edit')).toBe(true)
    })

    it('is false for one they do not', () => {
      expect(hasPermission(admin, 'customers.create')).toBe(false)
    })

    it('is false before the RPC has resolved', () => {
      expect(hasPermission(null, 'customers.edit')).toBe(false)
    })

    it('matches exactly — no prefix or namespace expansion', () => {
      // "customers.edit" must not grant "customers.editor" or "customers".
      expect(hasPermission(admin, 'customers')).toBe(false)
      expect(hasPermission(admin, 'customers.editor')).toBe(false)
    })
  })

  describe('hasAnyPermission', () => {
    it('is true when one of the names is held', () => {
      expect(hasAnyPermission(admin, ['customers.create', 'customers.edit'])).toBe(true)
    })

    it('is false when none is', () => {
      expect(hasAnyPermission(admin, ['customers.create'])).toBe(false)
    })

    it('is false for an empty list', () => {
      expect(hasAnyPermission(admin, [])).toBe(false)
    })
  })

  describe('hasAllPermissions', () => {
    it('is true when every name is held', () => {
      expect(hasAllPermissions(admin, ['customers.edit', 'customers.delete'])).toBe(true)
    })

    it('is false when one is missing', () => {
      expect(hasAllPermissions(admin, ['customers.edit', 'customers.create'])).toBe(false)
    })

    it('is false for an empty list, not vacuously true', () => {
      // [].every() is true, which would grant "all of nothing" to any caller
      // that passed an empty array — a component gating on a computed list would
      // silently open up when the list came out empty.
      expect(hasAllPermissions(admin, [])).toBe(false)
    })

    it('is false before the RPC has resolved', () => {
      expect(hasAllPermissions(null, ['customers.edit'])).toBe(false)
    })
  })

  describe('canEditEntity', () => {
    it('is true when the table names no edit permission', () => {
      // Open tables stay open even before get_userinfo lands — EntityView's
      // "Add {label}" would otherwise flash hidden on every list page.
      expect(canEditEntity(null, null)).toBe(true)
      expect(canEditEntity(null, undefined)).toBe(true)
      expect(canEditEntity(null, '')).toBe(true)
      expect(canEditEntity(admin, null)).toBe(true)
    })

    it('is true when the named permission is held', () => {
      expect(canEditEntity(admin, 'customers.edit')).toBe(true)
    })

    it('is false when the named permission is not held', () => {
      expect(canEditEntity(admin, 'customers.create')).toBe(false)
    })

    it('is false before the RPC has resolved when a permission is named', () => {
      expect(canEditEntity(null, 'customers.edit')).toBe(false)
    })
  })
})
