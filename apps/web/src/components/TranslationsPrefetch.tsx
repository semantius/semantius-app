import { useEffect, useMemo } from 'react'
import type { AnyRouter } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { useTable } from '@/hooks/useTable'
import {
  TENANT_PAGE_SIZE,
  TENANT_TABLE,
  activateLocale,
  isTenantTableAbsent,
  resolveInitialLocale,
  rowsToLocaleFiles,
  sessionPreferenceFrom,
  setSessionPreference,
  setTenantLocaleFiles,
  tenantPageQuery,
  type LocaleFile,
  type TranslationRow,
} from '@/i18n'

/**
 * Headless: the tenant's own translations, and the user's saved language.
 *
 * Two things arrive only after login, and both change what language the app
 * should be in:
 *
 *   1. the `ui_translations` rows — a tenant may translate the UI itself, and
 *      may offer a language this build ships no catalog for at all;
 *   2. the session preference — `get_userinfo`'s `language` / `locale`, which is
 *      the choice that follows a person between devices.
 *
 * So the locale is resolved a THIRD time here, after boot's two passes. A
 * tenant-only language therefore paints English first and switches once the rows
 * land; that is accepted, and it is why the pre-login cache exists (see
 * resolveLocale.ts) — the second visit paints it immediately.
 *
 * Mounted beside SidebarPrefetch in main.tsx, OUTSIDE the ProtectedRoute gate,
 * so nothing waits on it and the boot-overlay invariant is untouched: this
 * component renders nothing and can never be the thing that fails to render.
 *
 * `router` comes in as a PROP rather than from `useRouter()`, because that hook
 * is undefined outside `<RouterProvider>` — the same reason
 * `AuthProviderWrapper` takes one.
 *
 * Everything it knows about the platform's shape (the query, the paging, the
 * codes, the userinfo fields) is in `src/i18n/tenant.ts`.
 */
export function TranslationsPrefetch({ router }: { router: AnyRouter }) {
  const { token, rpcUserInfo, userInfo } = useAuth()

  // Through the GENERIC useTable, like every other read in the app: that is what
  // puts the request through the fetch interceptor (so a cold-start 404 is
  // retried rather than read as "no such table"), and it is what makes a row
  // edited in the admin grid refresh this layer — any generic mutation on the
  // table invalidates the ['table', TENANT_TABLE] key.
  const first = useTable<TranslationRow>(TENANT_TABLE, {
    query: tenantPageQuery(0),
    count: true,
    enabled: !!token,
  })

  // Further pages, one hook each: hooks cannot be called in a loop, and the
  // total is only known after the first page answers with its Content-Range.
  const total = first.totalCount ?? 0
  const second = useTable<TranslationRow>(TENANT_TABLE, {
    query: tenantPageQuery(1),
    enabled: !!token && total > TENANT_PAGE_SIZE,
  })
  const third = useTable<TranslationRow>(TENANT_TABLE, {
    query: tenantPageQuery(2),
    enabled: !!token && total > TENANT_PAGE_SIZE * 2,
  })
  const fourth = useTable<TranslationRow>(TENANT_TABLE, {
    query: tenantPageQuery(3),
    enabled: !!token && total > TENANT_PAGE_SIZE * 3,
  })

  const files = useMemo<ReadonlyMap<string, LocaleFile> | null>(() => {
    if (first.error && isTenantTableAbsent(first.error)) return new Map()
    if (!first.data) return null
    return rowsToLocaleFiles([
      ...first.data,
      ...(second.data ?? []),
      ...(third.data ?? []),
      ...(fourth.data ?? []),
    ])
  }, [first.data, first.error, second.data, third.data, fourth.data])

  useEffect(() => {
    if (!files) return
    setTenantLocaleFiles(files)
    setSessionPreference(sessionPreferenceFrom(rpcUserInfo, userInfo))
    // Idempotent, so StrictMode's doubled effect changes nothing: activation
    // replaces the message table with the same content, and invalidate() re-runs
    // loaders that are already cached (get_schema is on the QueryClient).
    void activateLocale(resolveInitialLocale()).then(() => router.invalidate())
  }, [files, rpcUserInfo, userInfo, router])

  return null
}
