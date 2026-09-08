import { StrictMode } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { I18nProvider } from '@lingui/react'
import { AuthProviderWrapper } from './contexts/AuthContext'
import { ThemeProvider } from './components/ThemeProvider'
import { AppToaster } from './components/AppToaster'
import { TooltipProvider } from './components/ui/tooltip'
import type { RouterContext } from './routes/__root'
import { initConfig, getConfigError } from './lib/config'
import { hideAppLoader } from './lib/appLoader'
import { BootFailure } from './components/BootFailure'
import { RouteErrorPage } from './components/RouteErrorPage'
import { SidebarPrefetch } from './components/layout/SidebarPrefetch'
import { TranslationsPrefetch } from './components/TranslationsPrefetch'
import { applyDevUrlToken } from './lib/devUrlToken'
import { activateLocale, i18n, resolveInitialLocale, translate } from './i18n'
import { enableCollector } from './i18n/missing'
import './global.css'
// MUST stay after './global.css'. These are the accessibility corrections to the
// shadcn palette, kept out of global.css because a `--preset` apply rewrites that
// file's token blocks. They win on source order alone, so the order of these two
// lines IS the mechanism — src/test/tokenContrast.test.ts asserts it.
import './theme-a11y.css'

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
  // A loader that throws — get_schema after the retry budget is spent, say —
  // must end in an error the user can act on, not TanStack's built-in red box.
  // The page's Try Again re-runs the loader (router.invalidate()), which is the
  // only thing that recovers a loader error; a bare boundary reset re-throws it.
  defaultErrorComponent: RouteErrorPage,
  context: {
    auth: {
      isAuthenticated: () => false,
      getToken: () => null,
    },
    // Filled in below, once the QueryClient exists. Declaring it here keeps the
    // context shape complete from the first render; RouterContextUpdater
    // (AuthContext) is what pushes the auth half in.
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
      // OFF ON PURPOSE. Retrying lives in the fetch interceptor
      // (lib/apiClient.ts, policy in lib/retry.ts), which every query's request
      // passes through. A second retry here would STACK on it — attempts
      // multiplied against a service that just asked us to slow down — so this
      // line and the interceptor change landed in the same commit and must stay
      // in agreement. The accepted cost: react-query no longer sees the attempts,
      // so its devtools show one slow query rather than several failed ones.
      retry: false,
    },
  },
})

// The loaders read and fill the same cache the components use — see
// RouterContext.queryClient in routes/__root.tsx for why that matters to a
// language switch. Assigned after both exist, because each is created above.
router.update({ context: { ...router.options.context, queryClient } })

const root = createRoot(document.getElementById('root')!)

// Load the locale, then the config, then render — in that order, and all inside
// the one promise chain whose .catch() takes the overlay down.
//
// The locale comes FIRST because <I18nProvider> renders `null` until a locale is
// active, and under the index.html overlay a component that renders nothing is a
// hang rather than an error: the user sees a spinner forever and the app has no
// way to say why. activateLocale() therefore never throws and always ends with
// something active — a failed layer logs and keeps the built-in catalog — so
// this line cannot be the thing that hangs.
//
// It runs TWICE. The first pass sees only the built-in languages, which is
// enough to translate BootFailure; the second runs after initConfig(), when the
// operator's customizer is known. The tenant's own languages arrive later still,
// in TranslationsPrefetch, which resolves a third time. Both
// passes resolve WITHOUT persisting: saving here would overwrite a cached
// preference for a language that is only available after login.
activateLocale(resolveInitialLocale()).then(() => initConfig()).then(async () => {
  await activateLocale(resolveInitialLocale())
  const configError = getConfigError()

  if (configError) {
    hideAppLoader()
    root.render(
      <StrictMode>
        <BootFailure
          title={translate('Configuration Error')}
          description={translate('The application could not load its configuration.')}
          detail={configError}
        />
      </StrictMode>,
    )
    return
  }

  // Start discovery: every string the app renders lands in the index through
  // the translate target. AFTER the config, because the target and its mode
  // are pushed in by initConfig() — and a no-op unless the mode discovers
  // (`dev` and `stage`; see src/i18n/missing.ts).
  enableCollector()

  root.render(
    <StrictMode>
      {/* Outermost provider, above the theme: <Trans> reads the catalog through
          it, and it re-renders the tree on a language change. useT() does not
          need it — it subscribes to the singleton directly — so a component test
          that renders bare still works. */}
      <I18nProvider i18n={i18n}>
      {/* attribute="class" is required: next-themes defaults to "data-theme",
          but our dark theme is keyed on the `.dark` class (see global.css
          @custom-variant + `.dark {}`). Without this, only color-scheme flips
          (dark scrollbars) while the CSS variables stay light. */}
      <ThemeProvider attribute="class" defaultTheme="system" storageKey="semantius-ui-theme">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthProviderWrapper router={router}>
              {/* Outside the ProtectedRoute gate on purpose: kicks off the
                  sidebar's modules query in parallel with the userinfo calls
                  the gate waits on. Renders nothing. */}
              <SidebarPrefetch />
              {/* Same place, same reason: the tenant's translations and the
                  user's saved language arrive only after login, and nothing
                  may wait on them. */}
              <TranslationsPrefetch router={router} />
              <RouterProvider router={router} />
            </AuthProviderWrapper>
          </TooltipProvider>
          <ReactQueryDevtools initialIsOpen={false} />
          {/* Portaled OUT of #root: ModalInert makes #root inert while a
              dialog is open, and a toast raised behind a dialog ("Saved") must
              still reach assistive technology. Base UI's own hiding keeps
              live regions too, so nothing is lost on that side either. */}
          {createPortal(<AppToaster />, document.body)}
        </QueryClientProvider>
      </ThemeProvider>
      </I18nProvider>
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
        title={translate('Application Failed to Start')}
        description={translate('An unexpected error occurred while loading the application.')}
        detail={err instanceof Error ? (err.stack || err.message) : String(err)}
      />
    </StrictMode>,
  )
})
