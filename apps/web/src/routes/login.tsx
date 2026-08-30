import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { useCallback, useEffect, useRef } from 'react'
import { buildOAuthState } from '@/lib/oauthState'
import { AuthFailure } from '@/components/AuthFailure'
import { hideAppLoader } from '@/lib/appLoader'

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context, search }) => {
    if (context.auth.isAuthenticated()) {
      throw redirect({
        to: (search as any).redirect || '/',
      })
    }
  },
  component: LoginComponent,
})

function LoginComponent() {
  // `error` is essential, not decorative: logIn() is fire-and-forget in
  // react-oauth2-code-pkce (it catches its own rejection and puts the message
  // here), so a login that never starts — non-secure context withholding
  // crypto.subtle, offline network, blocked storage — surfaces ONLY through
  // this value. Without a branch on it the index.html overlay never comes down
  // and the page spins forever.
  const { logIn, error } = useAuth()
  const search = Route.useSearch()
  const calledRef = useRef(false)

  const start = useCallback(() => {
    // Guard against React strict mode calling the effect twice — the second
    // logIn() would clearStorage() and clobber the first PKCE code verifier.
    calledRef.current = true

    const redirectTarget = (search as any).redirect
    logIn(buildOAuthState(redirectTarget || '/'))
  }, [logIn, search])

  useEffect(() => {
    if (calledRef.current) return
    start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    // The redirect never happened, so nothing else will take the overlay down.
    hideAppLoader()
    return (
      <AuthFailure
        message={error}
        description="The login flow could not be started."
        // Retry through the same start() so calledRef stays set and the
        // strict-mode guard can't swallow a manual attempt.
        onRetry={start}
      />
    )
  }

  // HTML overlay from index.html stays visible while we redirect to the OAuth provider
  return null
}
