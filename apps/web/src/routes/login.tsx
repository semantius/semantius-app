import { createFileRoute, redirect } from '@tanstack/react-router'
import { translate, useT } from '@/i18n'
import { pageTitle } from '@/lib/pageTitle'
import { useAuth } from '@/hooks/useAuth'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildOAuthState } from '@/lib/oauthState'
import { AuthFailure } from '@/components/AuthFailure'
import { hideAppLoader } from '@/lib/appLoader'

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: pageTitle(translate('Sign in')) }] }),
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
  //
  // But `error` can also arrive STALE. When the library mounts and finds
  // `loginInProgress` left set in localStorage with no `?code=` in the URL — a
  // login abandoned at the provider, or another tab mid-login, since all tabs
  // share that storage — it sets "Bad authorization state…" and clears the flag,
  // and logIn() never clears `error` again. Shown here, that card sat on screen
  // for the whole redirect this route had already started, then vanished when
  // the page unloaded. What tells the two apart is the library's own
  // `loginInProgress`: a start that failed clears it, a redirect in flight keeps
  // it set. And only once our own attempt has begun — on the first render the
  // stale error is there and the flag already cleared.
  const t = useT()
  const { logIn, error, loginInProgress } = useAuth()
  const search = Route.useSearch()
  const calledRef = useRef(false)
  const [started, setStarted] = useState(false)
  // Latched: Try Again sets `loginInProgress` again, and the card has to stay
  // mounted through that (its button shows the busy state) — the overlay is
  // already down, so unmounting it would leave a blank page.
  const [failed, setFailed] = useState(false)
  if (started && error && !loginInProgress && !failed) setFailed(true)

  const start = useCallback(() => {
    // Guard against React strict mode calling the effect twice — the second
    // logIn() would clearStorage() and clobber the first PKCE code verifier.
    calledRef.current = true
    setStarted(true)

    const redirectTarget = (search as any).redirect
    logIn(buildOAuthState(redirectTarget || '/'))
  }, [logIn, search])

  useEffect(() => {
    if (calledRef.current) return
    start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed && error) {
    // The redirect never happened, so nothing else will take the overlay down.
    hideAppLoader()
    return (
      <AuthFailure
        message={error}
        description={t('The login flow could not be started.')}
        // Retry through the same start() so calledRef stays set and the
        // strict-mode guard can't swallow a manual attempt.
        onRetry={start}
      />
    )
  }

  // HTML overlay from index.html stays visible while we redirect to the OAuth provider
  return null
}
