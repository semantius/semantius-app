/**
 * The permission rules, as pure functions of what `/rpc/get_userinfo` returned.
 *
 * They live here rather than inside the hooks in `hooks/useUserPermissions.ts`
 * so they can be tested for what they are — set membership over an array that
 * may be absent, the wrong type, or not yet loaded — instead of by building an
 * `AuthContextType` by hand, pushing it through a real provider and checking it
 * comes back out. That test exercised React's context, not this logic.
 *
 * `rpcUserInfo` is `null` until the RPC resolves, and its `permissions` field is
 * untyped JSON from the server, so every rule has to survive both.
 */

/**
 * What `/rpc/get_userinfo` returned, as far as these rules care: `null` until it
 * resolves, and an untyped bag otherwise. The index signature is load-bearing —
 * without it this is a "weak type" (all-optional), and TypeScript then rejects
 * `AuthContextType['rpcUserInfo']` for having no properties in common with it.
 */
export type PermissionHolder = { permissions?: unknown; [key: string]: unknown } | null | undefined

/** The permission list, or an empty one for every shape that is not a list. */
export function permissionsOf(rpcUserInfo: PermissionHolder): string[] {
  const permissions = rpcUserInfo?.permissions
  return Array.isArray(permissions) ? (permissions as string[]) : []
}

export function hasPermission(rpcUserInfo: PermissionHolder, name: string): boolean {
  return permissionsOf(rpcUserInfo).includes(name)
}

/**
 * An empty `names` is false, not true. `[].some()` is already false; `[].every()`
 * is vacuously TRUE, which would grant access to a component that asked for
 * "all of nothing" — so the empty case is rejected explicitly for both.
 */
export function hasAnyPermission(rpcUserInfo: PermissionHolder, names: string[]): boolean {
  if (names.length === 0) return false
  const held = permissionsOf(rpcUserInfo)
  return names.some((name) => held.includes(name))
}

export function hasAllPermissions(rpcUserInfo: PermissionHolder, names: string[]): boolean {
  if (names.length === 0) return false
  const held = permissionsOf(rpcUserInfo)
  return names.every((name) => held.includes(name))
}
