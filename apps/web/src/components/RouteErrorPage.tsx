import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { ErrorPage } from '@/components/ErrorPage'

/**
 * The router's `defaultErrorComponent` (main.tsx): what a route renders when
 * its loader throws.
 *
 * `reset` as the router hands it over only clears the error boundary — the
 * match underneath still holds the error, so the boundary re-throws on the next
 * render and the button does nothing. `router.invalidate()` is the call that
 * actually re-runs the loader; it produces a fresh match, which is the
 * boundary's reset key, so the boundary clears itself once the load succeeds.
 * That is what makes "Try Again" true for a get_schema that outlasted the retry
 * budget: the next click is a new request, not a re-render of the old failure.
 */
export function RouteErrorPage({ error }: ErrorComponentProps) {
  const router = useRouter()
  return <ErrorPage error={error} reset={() => void router.invalidate()} />
}
