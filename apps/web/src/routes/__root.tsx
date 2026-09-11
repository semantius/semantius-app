import { createRootRouteWithContext, HeadContent, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import ErrorBoundary from '@/components/ErrorBoundary'
import { ErrorPage } from '@/components/ErrorPage'
import { NotFoundPage } from '@/components/NotFoundPage'
import { RouteAnnouncer } from '@/components/a11y/RouteAnnouncer'
import { ModalInert } from '@/components/a11y/ModalInert'
import { pageTitle } from '@/lib/pageTitle'

// Define the router context interface
export interface RouterContext {
  auth: {
    isAuthenticated: () => boolean
    getToken: () => string | null
  }
  /**
   * The app's single QueryClient, so a loader can read and fill the SAME cache
   * the components use instead of fetching alongside it.
   *
   * It is what makes a language switch cheap: switching calls
   * `router.invalidate()` so every route's `head()` re-runs and `document.title`
   * follows the new language, and re-running a loader that goes to the network
   * would refetch `get_schema` for a change that is purely local. Through
   * `ensureQueryData` with `staleTime: Infinity` it is a cache hit.
   *
   * Optional because a router may be created before the client exists (and the
   * test harness builds a bare one); a loader that needs it says so.
   */
  queryClient?: import('@tanstack/react-query').QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // 2.4.2 Page Titled. Without <HeadContent> nothing ever writes document.title
  // and all 19 routes share the single static <title> in index.html — a browser
  // history and a set of tabs in which no two pages can be told apart. Each route
  // supplies its own via `head()`; this is the fallback for anything that does not.
  head: () => ({ meta: [{ title: pageTitle() }] }),
  component: RootComponent,
  errorComponent: ({ error, reset }) => (
    <ErrorPage error={error} reset={reset} />
  ),
  notFoundComponent: NotFoundPage,
})

function RootComponent() {
  return (
    <ErrorBoundary>
      <HeadContent />
      <RouteAnnouncer />
      <ModalInert />
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="top-right" />}
    </ErrorBoundary>
  )
}
