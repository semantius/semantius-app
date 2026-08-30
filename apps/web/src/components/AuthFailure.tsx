import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
export function AuthFailure({
  message,
  onRetry,
  title = 'Login Error',
  description = 'There was an issue completing authentication.',
}: AuthFailureProps) {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="max-w-md text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-muted-foreground">{description}</p>
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {message}
        </div>
        <div className="mt-6 space-y-3">
          <Button onClick={onRetry} className="w-full">
            Try Again
          </Button>
          <p className="text-xs text-muted-foreground">
            If the problem persists, try refreshing the page or clearing your browser cache.
          </p>
        </div>
      </div>
    </div>
  )
}
