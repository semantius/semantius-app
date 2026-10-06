import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { translate } from '@/i18n'
import { pageTitle } from '@/lib/pageTitle'
import { useAuth } from '@/hooks/useAuth'
import { useEffect, useState } from 'react'
import { AuthFailure } from '@/components/AuthFailure'
import { parseOAuthState } from '@/lib/oauthState'
import { hideAppLoader } from '@/lib/appLoader'

export const Route = createFileRoute('/oauth2_callback')({
  head: () => ({ meta: [{ title: pageTitle(translate('Completing sign-in')) }] }),
  component: CallbackComponent,
})

// Caps automatic recovery from a failed token exchange (expired/replayed code,
// PKCE race) at a single fresh logIn() per window. A failure is retried unless
// another one was recorded within RETRY_WINDOW_MS, so a persistent failure shows
// the error on its second occurrence instead of looping, while an unrelated
// failure later on gets its retry again. The window is time-based rather than a
// counter that only a success resets: with a counter, a tab that once spent its
// retry showed every later failure at once, however long afterwards.
// localStorage (not sessionStorage) so the budget is shared across tabs — two
// tabs logging in at once is a likely cause of a PKCE mismatch, and one tab's
// retry must not buy the other a second one. 60s because a round trip through
// the IdP's login form can take longer than 30s.
const RETRY_KEY = 'SC_oauth_retry'
const RETRY_WINDOW_MS = 60_000

interface RetryRecord {
  /** Failures in the current window. */
  count: number
  /** Epoch ms of the most recent failure. */
  at: number
}

function readRetryRecord(): RetryRecord | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(RETRY_KEY) ?? 'null')
    return typeof parsed?.count === 'number' && typeof parsed?.at === 'number' ? parsed : null
  } catch {
    return null
  }
}

/** Records this failure and answers whether to retry it automatically. */
function recordFailure(now = Date.now()): boolean {
  const last = readRetryRecord()
  const recent = last !== null && now - last.at < RETRY_WINDOW_MS
  const record: RetryRecord = { count: recent ? last.count + 1 : 1, at: now }
  try {
    localStorage.setItem(RETRY_KEY, JSON.stringify(record))
  } catch {
    // Unrecorded, a retry could not be capped and might loop; show the error.
    return false
  }
  return !recent
}

function CallbackComponent() {
  const { token, error, logIn, loginInProgress } = useAuth()
  const navigate = useNavigate()

  // Freeze whether an OAuth code was present at mount time. The library may
  // strip ?code= from the URL before the token exchange completes, so we
  // capture this once instead of re-reading window.location.search on every
  // render.
  const [hadOAuthCode] = useState(() => new URLSearchParams(window.location.search).has('code'))

  // The redirect target is encoded in the OAuth state parameter (stored in
  // localStorage by the library before the redirect). The state format is
  // `<nonce>:<redirectPath>` — parseOAuthState extracts the path.
  const [redirectTarget] = useState(() => parseOAuthState(localStorage.getItem('ROCP_auth_state')))

  // Safety timeout: if nothing happens within 5 seconds, the token exchange
  // likely never started (e.g. loginInProgress was already cleared after a
  // long break). Without this, the page hangs on the loading spinner forever.
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 5000)
    return () => clearTimeout(timer)
  }, [])

  // Auto-recover once from a failed token exchange. The auth code is single-use
  // and short-lived, so we never re-submit it — logIn() requests a brand-new
  // code. The retry window caps this at one automatic attempt: a persistent
  // failure (clock skew, PKCE/config mismatch) then falls through to the manual
  // error UI instead of looping /login → provider → callback → error forever.
  //
  // The decision is made in an effect (it writes storage, which a render must
  // not), and until it is made the route renders null, keeping the overlay up.
  // Rendering the card on the first error render, as this once did, took the
  // overlay down and flashed the error before every successful retry.
  const [failureHandling, setFailureHandling] = useState<'retry' | 'show' | null>(null)
  useEffect(() => {
    if (!error || failureHandling) return
    if (recordFailure()) {
      setFailureHandling('retry')
      logIn()
    } else {
      setFailureHandling('show')
    }
  }, [error, failureHandling, logIn])

  useEffect(() => {
    if (token) {
      // Successful exchange — reset the auto-retry budget for next time.
      localStorage.removeItem(RETRY_KEY)
      navigate({ to: redirectTarget || '/' })
    } else if (!hadOAuthCode && !error) {
      // Arrived at /oauth2_callback without an OAuth code — no active flow, send to login
      navigate({ to: '/login' })
    } else if (hadOAuthCode && !loginInProgress && !token && !error && timedOut) {
      // The library skipped the token exchange (loginInProgress was false in
      // storage, e.g. after a long break or stale callback URL). Restart the
      // login flow instead of hanging forever.
      logIn()
    }
  }, [token, hadOAuthCode, error, loginInProgress, timedOut, navigate, redirectTarget, logIn])

  if (error && failureHandling === 'show') {
    // Auth error that we won't auto-recover from — needs user interaction, so
    // hide the loading overlay to show the error UI. (While retrying, a fresh
    // logIn() redirect is in flight; keep the overlay up.)
    hideAppLoader()
    return <AuthFailure message={error} onRetry={() => logIn()} />
  }

  // HTML overlay stays visible while completing the token exchange
  return null
}
