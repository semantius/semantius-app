/**
 * The tenant's own translation layer, and the preference stored on the session.
 *
 * A cloud customer translates their deployment by writing rows into a
 * `ui_translations` table in their own database, and stores their chosen
 * language on their own user row. Both are platform data, so everything about
 * HOW they are read and written — the query, the paging, the RPC name, the codes
 * that mean "this platform has not applied the migration" — lives here, and
 * `components/TranslationsPrefetch.tsx` and `NavUser.tsx` hold none of it.
 *
 * That split is not tidiness. Every string below is an identifier, a query
 * fragment or an error code, and this directory is where the lint rule already
 * expects those; the same strings inside a component would be indistinguishable
 * from untranslated UI text.
 */

import type { SessionPreference } from './resolveLocale'

/** The one table this feature adds. Created by the platform migration. */
export const TENANT_TABLE = 'ui_translations'

/**
 * The table's unique key, as `on_conflict` wants it. A translate-mode save is
 * an UPSERT on these four columns (`Prefer: resolution=merge-duplicates`), one
 * row per save; the collector's insert uses the same columns with
 * `ignore-duplicates`, which is what keeps a request from overwriting a
 * translation.
 */
export const TRANSLATION_CONFLICT_COLUMNS: readonly string[] = ['locale', 'scope', 'key', 'context']

/** The permission the migration creates for writing translations. */
export const TRANSLATE_PERMISSION = 'translations.edit'

/** What stands in for it on a tenant whose migration has not landed. */
export const FALLBACK_TRANSLATE_PERMISSION = 'admin'

/**
 * The queue for one language: every request the collector recorded, newest
 * first. Read by the translate-mode panel when it opens, never prefetched.
 */
export function queueQuery(locale: string): string {
  return (
    'select=id,scope,key,context,origin,first_seen&translation=eq.' +
    `&locale=eq.${encodeURIComponent(locale)}&order=first_seen.desc&limit=${TENANT_PAGE_SIZE}`
  )
}

/**
 * When each of a language's translations was last written — the panel's
 * "changed since translated" compares this against the model's `updated_at`.
 */
export function translatedAtQuery(locale: string): string {
  return (
    'select=scope,key,context,updated_at&translation=neq.' +
    `&locale=eq.${encodeURIComponent(locale)}&limit=${TENANT_PAGE_SIZE}`
  )
}

/** The three model reads the label inventory is built from. */
export const MODEL_TABLES = {
  tables: 'tables',
  fields: 'fields',
  modules: 'modules',
} as const

export const MODEL_QUERIES = {
  tables: 'select=table_name,singular_label,plural_label,description,updated_at&limit=1000',
  fields:
    'select=table_name,field_name,title,description,enum_values,relationship_label,' +
    'singular_label_parent,plural_label_parent,updated_at&limit=5000',
  modules: 'select=module_slug,module_name,description,updated_at&limit=1000',
} as const

/** One page. PostgREST's own `max-rows` may cap it lower, which is harmless. */
export const TENANT_PAGE_SIZE = 1000

/**
 * How many pages the prefetch will read. Hooks cannot be called in a loop, so
 * the ceiling is fixed; 4000 translated rows is a heavily translated tenant, and
 * anything past it simply falls back to English rather than breaking.
 */
export const TENANT_MAX_PAGES = 4

/**
 * `translation=neq.` excludes the QUEUE — an empty translation is a request the
 * collector recorded, not something to render. `&` with an empty value after the
 * operator is valid PostgREST and means exactly "not the empty string".
 */
const TENANT_SELECT = 'select=locale,scope,key,context,translation&translation=neq.&order=id.asc'

/**
 * The query for one page. Byte-identical between pages apart from the offset,
 * because the query string is part of the react-query key.
 */
export function tenantPageQuery(page: number): string {
  const offset = page * TENANT_PAGE_SIZE
  return offset === 0
    ? `${TENANT_SELECT}&limit=${TENANT_PAGE_SIZE}`
    : `${TENANT_SELECT}&limit=${TENANT_PAGE_SIZE}&offset=${offset}`
}

/**
 * PostgREST's own codes for "that relation is not there".
 *
 * A STATUS never means this. The tenant's serverless PostgREST answers a bare
 * 404 to the first request after an idle period, and the fetch interceptor has
 * already spent its retry budget on that by the time an error surfaces — so only
 * a definitive body turns the tenant layer off.
 */
const TABLE_ABSENT_CODES = new Set(['42P01', 'PGRST205'])

/** PostgREST's own code for a function that is not in the schema. */
const FUNCTION_ABSENT_CODE = 'PGRST202'

function causeCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  const cause = error.cause
  if (!cause || typeof cause !== 'object') return undefined
  const code = (cause as Record<string, unknown>).code
  return typeof code === 'string' ? code : undefined
}

/** True only for a definitive "no such table" — see TABLE_ABSENT_CODES. */
export function isTenantTableAbsent(error: unknown): boolean {
  const code = causeCode(error)
  return code !== undefined && TABLE_ABSENT_CODES.has(code)
}

/** True only for a definitive "no such function". */
export function isPreferenceRpcAbsent(error: unknown): boolean {
  return causeCode(error) === FUNCTION_ABSENT_CODE
}

// ── The session preference ──────────────────────────────────────────────────

/** The platform RPC that stores the two preferences on the caller's own row. */
export const SAVE_PREFERENCES_RPC = 'set_user_preferences'

/**
 * Its arguments, named with PostgREST's `p_` convention. Each is sent ONLY when
 * the switcher decided it: the function reads an absent argument as "leave it",
 * so choosing a language cannot clear a formatting locale set separately.
 */
export interface SavePreferencesParams {
  p_language?: string | null
  p_locale?: string | null
}

export function savePreferencesParams(persist: {
  language?: string | null
  locale?: string | null
}): SavePreferencesParams {
  return {
    ...(persist.language !== undefined ? { p_language: persist.language } : {}),
    ...(persist.locale !== undefined ? { p_locale: persist.locale } : {}),
  }
}

/**
 * Read the two preferences off `get_userinfo`'s payload and the OIDC claims.
 *
 * DEFENSIVE by design, in three states: a string is a saved choice, `null` is
 * "use the browser default" saved explicitly, and an ABSENT field is a platform
 * that has not added the columns. Collapsing the last two would wipe the local
 * choice on every login against such a platform — which is every deployment
 * until the migration lands.
 */
export function sessionPreferenceFrom(
  rpcUserInfo: Record<string, unknown> | null | undefined,
  oidcUserInfo: Record<string, unknown> | null | undefined,
): SessionPreference {
  return {
    language: preferenceField(rpcUserInfo, 'language'),
    locale: preferenceField(rpcUserInfo, 'locale'),
    // The identity provider's own record of what this person reads. Consulted
    // only when neither field above answers — see resolveLocale.ts.
    claimLocale: typeof oidcUserInfo?.locale === 'string' ? oidcUserInfo.locale : undefined,
  }
}

function preferenceField(
  info: Record<string, unknown> | null | undefined,
  field: 'language' | 'locale',
): string | null | undefined {
  // `in`, not a truthiness check: that is the whole distinction above.
  if (!info || !(field in info)) return undefined
  const value = info[field]
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}
