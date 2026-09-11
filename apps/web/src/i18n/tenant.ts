/**
 * The platform's side of the two preferences, and the translate permission.
 *
 * A cloud customer's chosen language is stored on their own user row and
 * returned by `get_userinfo`; the switcher writes it back through an RPC.
 * Everything about HOW — the RPC name, its argument names, the code that
 * means "this platform has not applied the migration" — lives here, and
 * `NavUser.tsx` and `TranslationsPrefetch.tsx` hold none of it.
 *
 * That split is not tidiness. Every string below is an identifier or an error
 * code, and this directory is where the lint rule already expects those; the
 * same strings inside a component would be indistinguishable from
 * untranslated UI text.
 */

import type { SessionPreference } from './resolveLocale'

/** The permission the platform migration creates for writing translations. */
export const TRANSLATE_PERMISSION = 'translations.edit'

/** What stands in for it on a tenant whose migration has not landed. */
export const FALLBACK_TRANSLATE_PERMISSION = 'admin'

/** PostgREST's own code for a function that is not in the schema. */
const FUNCTION_ABSENT_CODE = 'PGRST202'

function causeCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  const cause = error.cause
  if (!cause || typeof cause !== 'object') return undefined
  const code = (cause as Record<string, unknown>).code
  return typeof code === 'string' ? code : undefined
}

/**
 * True only for a definitive "no such function". A STATUS never means this:
 * the tenant's serverless PostgREST answers a bare 404 to the first request
 * after an idle period, and the fetch interceptor has already spent its retry
 * budget on that by the time an error surfaces.
 */
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
