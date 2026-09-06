/*
 * A test harness is never mounted by the dev server, so Fast Refresh has no
 * opinion worth acting on here — and splitting `bootApp()` out into a second
 * file to satisfy the rule would separate the setup from the providers it
 * exists to set up. The form harness suppresses the same rule for the same
 * reason, per export.
 */
/* eslint-disable react-refresh/only-export-components */
import { type ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { inject } from 'vitest'
import { AuthProviderWrapper } from '@/contexts/AuthContext'
import { initConfig } from '@/lib/config'
import { routeTree } from '@/routeTree.gen'
import type { RouterContext } from '@/routes/__root'
import { setRuntimeEnv } from './runtimeConfig'
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
export async function bootApp(): Promise<void> {
  setRuntimeEnv({ VITE_CONTROL_PLANE_ORG: inject('orgSlug') })
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
export async function bootAppSignedOut(): Promise<void> {
  setRuntimeEnv({ VITE_CONTROL_PLANE_ORG: inject('orgSlug') })
  await initConfig()
  clearSession()
}

export function AppHarness({ children }: { children: ReactNode }) {
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
      } satisfies RouterContext,
    }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProviderWrapper router={router}>{children}</AuthProviderWrapper>
    </QueryClientProvider>
  )
}

/** `renderHook`'s `wrapper`, for a hook that needs the app's providers. */
export function appWrapper({ children }: { children: ReactNode }) {
  return <AppHarness>{children}</AppHarness>
}
