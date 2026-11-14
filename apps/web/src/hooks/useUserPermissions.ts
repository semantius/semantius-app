/**
 * Permission checking hooks.
 *
 * These read the user permissions that `/rpc/get_userinfo` returns; the rules
 * themselves are pure functions in `@/lib/permissions`, tested there without a
 * React tree.
 */

import { useAuth } from '@/hooks/useAuth'
import { canEditEntity, hasAllPermissions, hasAnyPermission, hasPermission } from '@/lib/permissions'

/**
 * Whether the current user holds a specific permission.
 * @param name - The permission to check (e.g., "customers.edit")
 */
export function useUserHasPermission(name: string): boolean {
  const { rpcUserInfo } = useAuth()
  return hasPermission(rpcUserInfo, name)
}

/**
 * Whether the current user holds AT LEAST ONE of the given permissions.
 * @param names - Permissions to check (e.g., ["customers.edit", "customers.delete"])
 */
export function useUserHasAnyPermission(names: string[]): boolean {
  const { rpcUserInfo } = useAuth()
  return hasAnyPermission(rpcUserInfo, names)
}

/**
 * Whether the current user holds ALL of the given permissions.
 * @param names - Permissions to check (e.g., ["customers.edit", "customers.delete"])
 */
export function useUserHasAllPermissions(names: string[]): boolean {
  const { rpcUserInfo } = useAuth()
  return hasAllPermissions(rpcUserInfo, names)
}

/**
 * Whether the current user may INSERT/UPDATE/DELETE rows of an entity.
 * @param editPermission - The table's `edit_permission`, or empty when the table is open.
 */
export function useCanEditEntity(editPermission: string | null | undefined): boolean {
  const { rpcUserInfo } = useAuth()
  return canEditEntity(rpcUserInfo, editPermission)
}
