/**
 * Permission checking hooks.
 *
 * These read the user permissions that `/rpc/get_userinfo` returns; the rules
 * themselves are pure functions in `@/lib/permissions`, tested there without a
 * React tree.
 */

import { useAuth } from '@/hooks/useAuth'
import { hasAllPermissions, hasAnyPermission, hasPermission } from '@/lib/permissions'

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
