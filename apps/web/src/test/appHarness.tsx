/*
 * A test harness is never mounted by the dev server, so Fast Refresh has no
 * opinion worth acting on here — and splitting `bootApp()` out into a second
 * file to satisfy the rule would separate the setup from the providers it
 * exists to set up. The form harness suppresses the same rule for the same
 * reason, per export.
 */
/* eslint-disable react-refresh/only-export-components */
import { type ReactElement, type ReactNode, useState } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { inject } from 'vitest'
import { I18nProvider } from '@lingui/react'
import { AuthProviderWrapper } from '@/contexts/AuthContext'
import { i18n } from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { initConfig } from '@/lib/config'
import type { RouterContext } from '@/routes/__root'
import { SELF_HOSTED, setRuntimeEnv } from './runtimeConfig'
import { clearSession, seedSession } from './session'

/**
 * The app's own providers, around whatever is under test.
 *
 * This is the counterpart to `components/form/__tests__/harness.tsx`: that one
 * builds the form context a control renders inside, this one builds the
 * application context a hook or a screen renders inside — the real
 * `AuthProviderWrapper` over the real `react-oauth2-code-pkce` provider, a real
 * `QueryClient`, and a real router over the generated route tree. Nothing here
 * stands in for app code, which is the point: a test that mounts this exercises
 * the same authentication, configuration and request path a user does.
 *
 * WHAT IT COSTS. Mounting it makes real requests — the tenant lookup in
 * `bootApp()`, then the provider's `userinfo` and `rpc/get_userinfo` on every
 * mount. Use it for what genuinely needs a session; a control that only needs a
 * form context does not (see the form harness), and a pure function needs
 * neither.
 */

/**
 * Configure the app the way `main.tsx` does, and sign in.
 *
 * Three things happen, in this order, and the order is the app's:
 *
 *  1. The org slug goes into `window.__ENV__` — the runtime-config channel the
 *     Docker image writes and `runtimeEnv()` reads first. Pinning it is what
 *     keeps the tenant lookup from deriving an org from the Vitest server's
 *     hostname (`localhost`), which is not an org.
 *  2. `initConfig()` runs for real, on the control-plane path: it fetches
 *     `api.semantius.cloud/organization/<org>` and takes the tenant's PostgREST
 *     url, client id and OAuth endpoints from the answer. No value below is
 *     invented; the tenant supplies them, as in production.
 *  3. The session is seeded from the one token `globalSetup` minted for the run.
 *     It must come after the config: the storage keys are prefixed per Vite mode,
 *     and the provider reads them when it mounts.
 */
export async function bootApp(env: Record<string, string> = {}): Promise<void> {
  setRuntimeEnv({ VITE_CONTROL_PLANE_ORG: inject('orgSlug'), ...env })
  await initConfig()
  seedSession()
}

/**
 * `bootApp()` without the session — the signed-out state, for the branches that
 * only exist when there is no token.
 *
 * It CLEARS the storage keys rather than merely not writing them: localStorage
 * outlives a test, so "signed out" has to be made true, not assumed. A test that
 * seeded a session earlier in the file would otherwise run signed IN here, and
 * the assertion it is making ("nothing was requested") would quietly invert.
 */
export async function bootAppSignedOut(env: Record<string, string> = {}): Promise<void> {
  setRuntimeEnv({ VITE_CONTROL_PLANE_ORG: inject('orgSlug'), ...env })
  await initConfig()
  clearSession()
}

/**
 * Boot signed in, with the OAuth `userinfo` endpoint pointing at a URL that
 * really answers 404 — so the provider's failure path runs for real.
 *
 * There is no other way to reach it from here. A 401 or 403 would be a TOKEN
 * REJECTION, which `AuthContext` answers by re-authenticating (a full-page
 * redirect out of the test), and a 429 or a 5xx cannot be asked for on demand —
 * that one is §10's work, through Playwright interception. A 404 from a real
 * host is a genuine "the provider did not answer with a user", which is exactly
 * the state the error card exists for.
 *
 * It has to take the SELF-HOSTED path to do it: on the control-plane path every
 * OAuth endpoint is derived from the tenant slug, so there is nothing to bend.
 * The values still come from the tenant — the cloud lookup runs first and the
 * config is rebuilt from what it returned, with one endpoint changed — so this
 * is the real deployment's configuration minus one working URL.
 */
export async function bootAppWithFailingUserinfo(): Promise<void> {
  const org = inject('orgSlug')
  setRuntimeEnv({ VITE_CONTROL_PLANE_ORG: org })
  const cloud = await initConfig()

  setRuntimeEnv({
    VITE_CONTROL_PLANE_URL: SELF_HOSTED,
    VITE_CONTROL_PLANE_ORG: org,
    VITE_API_BASE_URL: cloud.apiBaseUrl,
    VITE_OAUTH_CLIENT_ID: cloud.oauthClientId,
    VITE_OAUTH_AUTH_ENDPOINT: cloud.oauthAuthEndpoint,
    VITE_OAUTH_TOKEN_ENDPOINT: cloud.oauthTokenEndpoint,
    VITE_OAUTH_USERINFO_ENDPOINT: `https://${org}.semantius.cloud/api/auth/oauth2/userinfo-does-not-exist`,
  })
  await initConfig()
  seedSession()
}

/**
 * What `AuthProviderWrapper` needs a router FOR: it publishes the auth state
 * into the router context (`router.update()`) and invalidates the matches
 * (`router.invalidate()`) whenever the token changes. Neither reads a route.
 *
 * So the default tree is empty, and that is not a stand-in for the app's — it is
 * the smallest REAL router the provider can talk to. Importing
 * `routeTree.gen.ts` instead would pull every route module (drizzle-cube,
 * CodeMirror, the whole grid) into the graph of every file that renders this
 * harness, for a tree nothing navigates. A test that DOES navigate passes the
 * generated tree in through `routeTree` and pays for it deliberately.
 */
const EMPTY_TREE = createRootRoute()

export function AppHarness({
  children,
  routeTree = EMPTY_TREE,
}: {
  children: ReactNode
  routeTree?: Parameters<typeof createRouter>[0]['routeTree']
}) {
  // Per mount, created once: a QueryClient shared between tests would carry one
  // test's cached rows into the next, and a router recreated on every render
  // would re-run `router.update()` forever.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // The app retries; a test that is asserting the error should not wait
        // for three of them. This is test configuration, not a stand-in — the
        // request, the response and the error it produces are all real.
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [router] = useState(() =>
    createRouter({
      routeTree,
      // No browser history to write to, and no URL to inherit: a hook test must
      // not depend on which route the previous test left behind.
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: {
        auth: {
          isAuthenticated: () => false,
          getToken: () => null,
        },
        // What main.tsx puts there: a loader reads and fills the SAME cache the
        // components use. RouterContextUpdater spreads rather than replaces, so
        // it survives every auth update.
        queryClient,
      } satisfies RouterContext,
    }),
  )

  // <I18nProvider> is main.tsx's outermost provider, and it is here for the same
  // reason: <Trans> reads the catalog off React context. `setup.browser.ts` has
  // already activated en-US, so it never renders null.
  return (
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AuthProviderWrapper router={router}>{children}</AuthProviderWrapper>
      </QueryClientProvider>
    </I18nProvider>
  )
}

/** `renderHook`'s `wrapper`, for a hook that needs the app's providers. */
export function appWrapper({ children }: { children: ReactNode }) {
  return <AppHarness>{children}</AppHarness>
}

/**
 * Render something that ROUTES — a `<Link>`, a `useRouter()`, a
 * `router.history.push()` — in the app's own provider composition.
 *
 * The nesting is `main.tsx`'s, in the same order: QueryClient, Tooltip,
 * `AuthProviderWrapper` over the router, `RouterProvider` for that same router.
 * The route tree is a single root route rendering `ui`, so the component under
 * test is what the router renders — nothing else is invented, and the router,
 * its history and its links are all real.
 *
 * The returned `router` is the observation point: after a click that navigates,
 * `router.history.location` says where the app actually went. That is a fact
 * about a real history, not a spy recording a call.
 */
export function renderInApp(ui: ReactElement, { initialEntries = ['/'] }: { initialEntries?: string[] } = {}) {
  // A root route with an index child, which is the shape the router expects: a
  // root route on its own matches nothing at '/' and renders the not-found
  // component instead of the subject.
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => ui }),
  ])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries }),
    context: {
      auth: {
        isAuthenticated: () => false,
        getToken: () => null,
      },
      // See the note in AppHarness: main.tsx puts it there and
      // RouterContextUpdater must not drop it.
      queryClient,
    } satisfies RouterContext,
  })

  const result = render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProviderWrapper router={router}>
            <RouterProvider router={router} />
          </AuthProviderWrapper>
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return { ...result, router }
}
