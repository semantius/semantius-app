import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getConfig } from '@/lib/config'
import { setInterceptorToken } from '@/lib/apiClient'

export const Route = createFileRoute('/logout')({
  head: () => ({ meta: [{ title: pageTitle('Signing out') }] }),
  component: LogoutRoute,
})

function LogoutRoute() {
  const { logOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const performLogout = async () => {
      const config = getConfig()
      const logoutEndpoint = config.oauthLogoutEndpoint
      const logoutAPIEndpoint = config.oauthLogoutAPIEndpoint
      const clientId = config.oauthClientId

      // Call the OAuth logout API to clear server-side cookies
      if (logoutAPIEndpoint) {
        try {
          await fetch(logoutAPIEndpoint, { method: 'POST', credentials: 'include' })
        } catch {
          // Ignore errors — best-effort cookie cleanup
        }
      }

      // Clear the fetch interceptor token immediately — logOut() only updates
      // React state, and the useLayoutEffect that normally calls this won't
      // fire before we navigate away.
      setInterceptorToken(null)

      // Synchronously wipe the library's storage keys so the token cannot
      // survive a page reload. The library's logOut() uses React state setters
      // which are async and may not flush before we navigate.
      const prefix = `SC_${import.meta.env.MODE}_`
      for (const store of [sessionStorage, localStorage]) {
        for (const key of Object.keys(store)) {
          if (key.startsWith(prefix)) store.removeItem(key)
        }
      }

      // Clear React state (library internals)
      logOut()
      
      if (logoutEndpoint) {
        // IDP has a logout endpoint (like Auth0) - redirect there AFTER clearing local session
        // Auth0 is a one-way trip - it won't return to our app
        // Add small delay to ensure local logout completes
        setTimeout(() => {
          const logoutUrl = new URL(logoutEndpoint)
          if (clientId) {
            logoutUrl.searchParams.set('client_id', clientId)
          }
          
          window.location.href = logoutUrl.toString()
        }, 100)
      } else {
        // No logout endpoint - show our own logout confirmation page
        // Use navigate after a brief delay to ensure logout completes
        setTimeout(() => {
          navigate({ to: '/logout-success' })
        }, 100)
      }
    }

    performLogout()
  }, [logOut, navigate])

  // Show a simple message while logout is processing
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Logging out...</h2>
        <p className="mt-2 text-muted-foreground">Please wait while we log you out.</p>
      </div>
    </div>
  )
}
