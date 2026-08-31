/**
 * User-menu resolution — the pure half of the configurable account menu.
 *
 * The lower-left user menu (see components/layout/NavUser.tsx) is no longer
 * hard-coded: `VITE_BACKEND_TYPE` selects a built-in menu (`cloud` default,
 * `self_hosted`), or `custom` deserializes a `VITE_UI_CUSTOMIZER` JSON string.
 *
 * Everything here is deliberately free of `window` / `import.meta.env` reads so
 * it stays unit-testable; lib/config.ts does the env reading and calls in.
 */

export type BackendType = 'cloud' | 'self_hosted' | 'custom'

export interface UserMenuEntry {
  title: string
  url: string
  /** When set, the entry renders only if the user holds this permission. */
  permission?: string
}

export interface UiCustomizer {
  user: { menu: UserMenuEntry[] }
}

const BACKEND_TYPES: readonly BackendType[] = ['cloud', 'self_hosted', 'custom']

/** Valid `VITE_BACKEND_TYPE` values, for error messages. */
export const BACKEND_TYPE_VALUES = BACKEND_TYPES.join(', ')

/**
 * The built-in menus. `{orgid}` is substituted with the org slug at resolution
 * time — never mutate these; resolveUserMenu() copies before substituting.
 */
const BUILT_IN_MENUS: Record<'cloud' | 'self_hosted', UserMenuEntry[]> = {
  cloud: [
    { title: 'Settings', url: '/settings?orgid={orgid}' },
    { title: 'Profile', url: 'https://app.semantius.com/settings?orgid={orgid}' },
    {
      title: 'Platform',
      url: 'https://app.semantius.com/settings/organization?orgid={orgid}',
      permission: 'admin',
    },
  ],
  self_hosted: [
    { title: 'Account', url: '/idp/account' },
    { title: 'User Manager', url: '/idp/admin', permission: 'admin' },
  ],
}

/**
 * Parse `VITE_BACKEND_TYPE`. Unset / empty defaults to `cloud`; an unrecognised
 * value returns null so the caller can record a blocking config error rather
 * than silently falling back to a menu the operator did not ask for.
 */
export function parseBackendType(raw: string | undefined): BackendType | null {
  const value = (raw ?? '').trim()
  if (value === '') return 'cloud'
  return (BACKEND_TYPES as readonly string[]).includes(value) ? (value as BackendType) : null
}

/** True for an absolute http(s) URL — those leave the SPA, so no router push. */
export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/**
 * Resolve the menu for a backend type, substituting `{orgid}` with the org slug.
 * Returns `{ error }` (never throws) so config.ts can turn a bad customizer into
 * the same blocking boot screen a broken VITE_OAUTH_CONFIG produces.
 */
export function resolveUserMenu(
  backendType: BackendType,
  customizerJson: string | undefined,
  orgSlug: string | undefined,
): { menu: UserMenuEntry[] } | { error: string } {
  let source: UserMenuEntry[]

  if (backendType === 'custom') {
    const raw = (customizerJson ?? '').trim()
    if (!raw) {
      return {
        error:
          'VITE_BACKEND_TYPE=custom requires VITE_UI_CUSTOMIZER to hold a JSON user-menu ' +
          'definition of the shape {"user":{"menu":[{"title":"…","url":"…"}]}}.',
      }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return {
        error: `VITE_UI_CUSTOMIZER is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
    const validated = validateCustomizer(parsed)
    if ('error' in validated) return validated
    source = validated.menu
  } else {
    source = BUILT_IN_MENUS[backendType]
  }

  // Copy before substituting — BUILT_IN_MENUS is module state shared across every
  // call, so substituting in place would bake the first org's slug in forever.
  return { menu: source.map((entry) => ({ ...entry, url: entry.url.replaceAll('{orgid}', orgSlug ?? '') })) }
}

function validateCustomizer(parsed: unknown): { menu: UserMenuEntry[] } | { error: string } {
  if (!isPlainObject(parsed)) {
    return { error: 'VITE_UI_CUSTOMIZER must be a JSON object of the shape {"user":{"menu":[…]}}.' }
  }
  if (!isPlainObject(parsed.user)) {
    return { error: 'VITE_UI_CUSTOMIZER is missing the "user" object — expected {"user":{"menu":[…]}}.' }
  }
  const menu = parsed.user.menu
  if (!Array.isArray(menu)) {
    return { error: 'VITE_UI_CUSTOMIZER is missing the "user.menu" array — expected {"user":{"menu":[…]}}.' }
  }

  for (let i = 0; i < menu.length; i++) {
    const problem = entryProblem(menu[i])
    if (problem) return { error: `VITE_UI_CUSTOMIZER "user.menu" entry ${i} is invalid: ${problem}` }
  }

  return { menu: menu as UserMenuEntry[] }
}

/** Describe what is wrong with one menu entry, or null when it is valid. */
function entryProblem(entry: unknown): string | null {
  if (!isPlainObject(entry)) return 'expected an object with "title" and "url".'
  if (!isNonEmptyString(entry.title)) return '"title" must be a non-empty string.'
  if (!isNonEmptyString(entry.url)) return '"url" must be a non-empty string.'
  if (entry.permission !== undefined && typeof entry.permission !== 'string') {
    return '"permission" must be a string when present.'
  }
  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}
