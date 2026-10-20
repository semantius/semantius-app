/**
 * Feature flags for `AppConfig.features`.
 *
 * Two sources, merged: VITE_APP_FEATURES (a comma-separated list) and, on the
 * control-plane path, the tenant's `plan.entitlements`. Either may be absent —
 * the plan and its entitlements are both optional in the tenant response.
 *
 * A pure module, so it is tested in node without a tenant (see userMenu.ts for
 * the same split).
 */

/** Split a comma-separated list, trimming each item and dropping empty ones. */
export function parseFeatureList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/** Union of the lists, in first-seen order. A null or undefined list counts as empty. */
export function mergeFeatures(...lists: ReadonlyArray<readonly string[] | null | undefined>): string[] {
  const merged = new Set<string>()
  for (const list of lists) {
    for (const item of list ?? []) merged.add(item)
  }
  return [...merged]
}
