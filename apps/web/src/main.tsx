import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProviderWrapper } from './contexts/AuthContext'
import { ThemeProvider } from './components/ThemeProvider'
import { Toaster } from './components/ui/sonner'
import { TooltipProvider } from './components/ui/tooltip'
import type { RouterContext } from './routes/__root'
import { initConfig, getConfigError } from './lib/config'
import { hideAppLoader } from './lib/appLoader'
import { BootFailure } from './components/BootFailure'
import { applyDevUrlToken } from './lib/devUrlToken'
import './global.css'

// Seed auth from a `#jwt=` URL fragment on localhost/preview builds, before the
// router and AuthProvider read token storage. No-op + deny-by-default in prod.
applyDevUrlToken()

// Diagnostic floor. Nothing else in the app observes rejected promises, so a
// throw in code that isn't inside a React render (an event handler, a fire-and-
// forget async call) currently vanishes without a trace. Log always; surface it
// loudly in dev only. This does not recover from anything — it makes the silence
// audible.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason)
  if (import.meta.env.DEV) {
    // Best-effort: the Toaster may not be mounted yet during boot, and a failure
    // here must never mask the rejection we are reporting.
    import('sonner')
      .then(({ toast }) => {
        const reason = event.reason
        toast.error('Unhandled promise rejection', {
          description: reason instanceof Error ? reason.message : String(reason),
        })
      })
      .catch(() => {})
  }
})

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance with context
const router = createRouter({
  routeTree,
  context: {
    auth: {
      isAuthenticated: () => false,
      getToken: () => null,
    },
  } satisfies RouterContext,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Export router for use in AuthContext (for invalidation)
export { router }

// Create a query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      refetchOnMount: 'always', // Always refetch when component mounts (even if fresh)
      refetchOnWindowFocus: 'always', // Always refetch when window regains focus (even if fresh)
      refetchOnReconnect: true, // Always refetch when reconnecting to network
      retry: 1,
    },
  },
})

const root = createRoot(document.getElementById('root')!)

// Load config (async) before rendering the app
initConfig().then(() => {
  const configError = getConfigError()

  if (configError) {
    hideAppLoader()
    root.render(
      <StrictMode>
        <BootFailure
          title="Configuration Error"
          description="The application could not load its configuration."
          detail={configError}
        />
      </StrictMode>,
    )
    return
  }

  root.render(
    <StrictMode>
      {/* attribute="class" is required: next-themes defaults to "data-theme",
          but our dark theme is keyed on the `.dark` class (see global.css
          @custom-variant + `.dark {}`). Without this, only color-scheme flips
          (dark scrollbars) while the CSS variables stay light. */}
      <ThemeProvider attribute="class" defaultTheme="system" storageKey="semantius-ui-theme">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthProviderWrapper router={router}>
              <RouterProvider router={router} />
            </AuthProviderWrapper>
          </TooltipProvider>
          <ReactQueryDevtools initialIsOpen={false} />
          <Toaster position="top-right" />
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}).catch((err: unknown) => {
  // initConfig() records the failures it anticipates in _configError and
  // resolves. A rejection here is therefore something it did NOT anticipate —
  // and without this branch root.render() is never called, so the index.html
  // overlay stays up over an empty page: the same infinite spinner as a hung
  // login, reached by a different route.
  console.error('[boot] initConfig() failed', err)
  hideAppLoader()
  root.render(
    <StrictMode>
      <BootFailure
        title="Application Failed to Start"
        description="An unexpected error occurred while loading the application."
        detail={err instanceof Error ? (err.stack || err.message) : String(err)}
      />
    </StrictMode>,
  )
})
