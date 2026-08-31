import { useAuth } from '@/hooks/useAuth'
import { useTable } from '@/hooks/useTable'
import type { Module } from '@/contexts/AuthContext'

/**
 * Headless: starts the sidebar's modules fetch as soon as a token exists.
 *
 * Mounted inside AuthProviderWrapper but OUTSIDE the ProtectedRoute gate (see
 * main.tsx), so the request goes out in parallel with /userinfo and
 * /rpc/get_userinfo rather than waiting for both to resolve before the sidebar
 * even mounts — roughly one round trip earlier.
 *
 * IMPORTANT: the useTable call below must stay byte-identical to
 * ModuleSwitcher's (layout/ModuleSwitcher.tsx) and NavApps'. The react-query key
 * is ['table', tableName, query, count], so any drift in the query string turns
 * this from a prefetch into a duplicate request.
 */
export function SidebarPrefetch() {
  const { token } = useAuth()

  useTable<Module>('modules', {
    query: 'order=module_name.asc',
    enabled: !!token,
  })

  return null
}
