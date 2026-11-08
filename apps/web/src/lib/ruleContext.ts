/**
 * What a JsonLogic rule can ask about beyond the record it runs against: who is
 * signed in and what time it is. The backend gives the rules it evaluates the same
 * reserved variables.
 *
 * The user is module state rather than a hook because JsonLogic operators are
 * global and synchronous, so `has_permission` has no React tree to read from.
 *
 * `$today` and `$now` are UTC, as they are on the server, so near midnight `$today`
 * can differ from the calendar on the user's wall.
 */
import { hasPermission, type PermissionHolder } from '@/lib/permissions'

let ruleUser: PermissionHolder = null

/** What `/rpc/get_userinfo` returned for the signed-in user, or null before it resolves. */
export function setRuleUser(user: PermissionHolder): void {
  ruleUser = user
}

export function ruleUserHasPermission(name: string): boolean {
  return hasPermission(ruleUser, name)
}

/** The data a rule runs against. The reserved names win over a field of the same name, as on the server. */
export function withRuleContext(values: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    ...values,
    $today: now.slice(0, 10),
    $now: `${now.slice(0, 19)}+00:00`,
    $user_id: ruleUser?.user_id ?? null,
  }
}
