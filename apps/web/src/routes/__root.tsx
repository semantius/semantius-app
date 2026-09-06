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
