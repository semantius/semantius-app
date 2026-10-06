import { useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useT } from '@/i18n'

interface AuthFailureProps {
  /** The error message from `useAuth().error` (or an equivalent auth failure). */
  message: string
  /** Retry handler — restarts the OAuth flow. */
  onRetry: () => void
  /** Heading; both legs of the flow use the default unless they need to differ. */
  title?: string
  /** One-line explanation shown above the raw error text. */
  description?: string
}

/**
 * Failure card for OAuth errors. Shared by BOTH legs of the flow — the departure
 * leg (`routes/login.tsx`, when logIn() throws before redirecting) and the return
 * leg (`routes/oauth2_callback.tsx`, when the token exchange fails) — so a login
 * that cannot start looks the same as one that cannot complete.
 *
 * Callers are responsible for hideAppLoader(): rendering this while the index.html
 * overlay is still up would put the card behind an opaque spinner.
 */
export function AuthFailure({ message, onRetry, title, description }: AuthFailureProps) {
  const t = useT()
  const { loginInProgress } = useAuth()
  // Busy from the click until the redirect leaves the page. logIn() is
  // fire-and-forget and gives the caller nothing to await, so the library's own
  // loginInProgress is the signal: it is set synchronously by logIn() and
  // cleared again only when the redirect could not be started — which also
  // re-enables the button for another attempt. Both legs reach this card with
  // it cleared (a failed start, or a failed exchange), so it cannot read busy
  // before a click.
  const [retried, setRetried] = useState(false)
  const busy = retried && loginInProgress
  // Defaulted in the body rather than in the parameter list: a default there is
  // evaluated before any hook has run, so it could not be translated.
  const heading = title ?? t('Login Error')
  const explanation = description ?? t('There was an issue completing authentication.')

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="max-w-md text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        {/* h1, not h2: this card IS the page on /login and /oauth2_callback —
            there is no other heading above it to be a level below. */}
        <h1 className="mt-4 text-xl font-semibold">{heading}</h1>
        <p className="mt-2 text-muted-foreground">{explanation}</p>
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {message}
        </div>
        <div className="mt-6 space-y-3">
          <Button
            onClick={() => {
              setRetried(true)
              onRetry()
            }}
            disabled={busy}
            aria-busy={busy}
            className="w-full"
          >
            {busy && <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />}
            {t('Try Again')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('If the problem persists, try refreshing the page or clearing your browser cache.')}
          </p>
        </div>
      </div>
    </div>
  )
}
