import { useEffect } from 'react'
import type { AnyRouter } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { activateLocale, resolveInitialLocale, sessionPreferenceFrom, setSessionPreference } from '@/i18n'

/**
 * Headless: the user's saved language, and the translations only a session can read.
 *
 * Two things arrive only after login, and both change what language the app
 * should be in:
 *
 *   1. the session preference — `get_userinfo`'s `language` / `locale`, which
 *      is the choice that follows a person between devices;
 *   2. the translate target's record for the language, in `prod` the tenant's
 *      own overrides — read by the i18n layer itself (src/i18n/store.ts), but
 *      through the app's API with the bearer token, so not before there is one.
 *
 * So the locale is resolved a THIRD time here, after boot's two passes: once
 * the token and `get_userinfo` have settled, the preference is pushed in and
 * the language activated again, which is also what loads the record. A
 * tenant's overrides therefore paint the shipped file first and switch once
 * the record lands; that is accepted.
 *
 * Mounted beside SidebarPrefetch in main.tsx, OUTSIDE the ProtectedRoute gate,
 * so nothing waits on it and the boot-overlay invariant is untouched: this
 * component renders nothing and can never be the thing that fails to render.
 *
 * `router` comes in as a PROP rather than from `useRouter()`, because that hook
 * is undefined outside `<RouterProvider>` — the same reason
 * `AuthProviderWrapper` takes one.
 *
 * Everything it knows about the platform's shape (the userinfo fields) is in
 * `src/i18n/tenant.ts`.
 */
export function TranslationsPrefetch({ router }: { router: AnyRouter }) {
  const { token, rpcUserInfo, rpcUserInfoLoading, userInfo } = useAuth()

  useEffect(() => {
    // Wait for `get_userinfo` to settle either way: a platform without the
    // preference columns answers without them, and a failed call answers with
    // nothing — both are "no session preference", and both still get the
    // third pass, because the record needs the token that is now there.
    if (!token || rpcUserInfoLoading) return
    setSessionPreference(sessionPreferenceFrom(rpcUserInfo, userInfo))
    // Idempotent, so StrictMode's doubled effect changes nothing: activation
    // replaces the message table with the same content, and invalidate() re-runs
    // loaders that are already cached (get_schema is on the QueryClient).
    void activateLocale(resolveInitialLocale()).then(() => router.invalidate())
  }, [token, rpcUserInfo, rpcUserInfoLoading, userInfo, router])

  return null
}
