import { type ReactNode, useEffect, useLayoutEffect, useContext, useState, useRef, createContext, useMemo } from 'react'
import { AuthProvider, AuthContext as OAuthContext } from 'react-oauth2-code-pkce'
import type { IAuthContext } from 'react-oauth2-code-pkce'
import { ConfigErrorPage } from '@/components/ConfigErrorPage'
import { getApiConfig, createApiHeaders, setInterceptorToken } from '@/lib/apiClient'
import { getConfig } from '@/lib/config'
import { translate } from '@/i18n'
import type { AnyRouter } from '@tanstack/react-router'
import type { RouterContext } from '@/routes/__root'

// User info types
export interface UserInfo {
  sub?: string
  name?: string
  email?: string
  picture?: string
  preferred_username?: string
  given_name?: string
  family_name?: string
  [key: string]: unknown
}

export interface Module {
  id: number
  alias: string
  logo_url: string | null
  icon_name: string | null
  home_page: string
  created_at: string
  logo_color: string | null
  updated_at: string
  description: string
  module_name: string
  module_slug: string
  view_permission: string
  edit_permission: string
  dashboard_config: import('drizzle-cube/client').DashboardConfig | null
}

/**
 * Compute display name and title for a module.
 * - DisplayName is initialized from module_name, DisplayTitle from description.
 * - If module_name starts with '_': DisplayName = description, DisplayTitle = ""
 * - If description starts with module_name: DisplayName = description, DisplayTitle = ""
 */
export function getModuleDisplay(module: Module): { displayName: string; displayTitle: string } {
  const name = module.module_name
  const desc = module.description || ''

  // Rule a: module name starts with underscore — use description as display name
  if (name.startsWith('_')) {
    return { displayName: desc || name, displayTitle: '' }
  }

  // Rule b: description starts with module name — promote description to display name
  if (desc.startsWith(name)) {
    return { displayName: desc, displayTitle: '' }
  }

  // Default: name on top, description below
  return { displayName: name, displayTitle: desc }
}

export interface RpcUserInfo {
  modules?: Module[]
  [key: string]: unknown
}

/**
 * Build an Error from a failed fetch Response, capturing the HTTP status, URL and
 * response body (parsed as JSON when possible) onto `error.cause`.
 *
 * ApiErrorDisplay renders `error.cause` in its expandable "Details" panel, so this
 * is what surfaces the actual server payload — e.g. PostgREST's
 * `{"message":"jwk not found"}` — instead of an empty `statusText` (HTTP/2 drops
 * the reason phrase, so `response.statusText` is blank and useless on its own).
 */
async function responseError(label: string, response: Response): Promise<Error> {
  const raw = await response.text().catch(() => '')
  let body: unknown = raw
  try {
    body = raw ? JSON.parse(raw) : ''
  } catch {
    // Non-JSON body — keep the raw text as-is.
  }
  const statusText = response.statusText ? ` ${response.statusText}` : ''
  return new Error(`${label}: ${response.status}${statusText}`, {
    cause: { status: response.status, url: response.url, response: body },
  })
}

// One-shot guard for the token self-heal below. sessionStorage (not local):
// scoped to the tab, survives the OAuth redirect round-trip, and clears when the
// tab closes. It caps auto-reauth at ONCE per session so a token refused for a
// NON-transient reason (rotated signing keys, wrong tenant, clock skew) can never
// drive an infinite logout→login loop. Reset on the next clean success.
const REAUTH_ATTEMPTED_KEY = 'sc_reauth_attempted'

// Well-known "this access token cannot be verified" signatures. The endpoints do
// NOT use a consistent 401 — PostgREST answers 400 `{"message":"jwk not found"}`
// for an unverifiable token and the OAuth userinfo endpoint answers 500 — so we
// match the response body/message, not just the status.
const TOKEN_REJECTION_RE =
  /jwk not found|jwserror|not a valid jwt|invalid jwt|signature error|jwt expired|token .*expired|invalid[_ ]token|invalid access token/i

/**
 * Does this failed-fetch error mean the ACCESS TOKEN itself was refused (vs a
 * transient network/server problem we must NOT log the user out over)? Reads the
 * `{ status, response }` that responseError() captured onto error.cause.
 */
export function isTokenRejection(err: unknown): boolean {
  if (!(err instanceof Error) || typeof err.cause !== 'object' || err.cause === null) return false
  const cause = err.cause as { status?: number; response?: unknown }
  if (cause.status === 401 || cause.status === 403) return true
  const body = cause.response
  const text =
    typeof body === 'string'
      ? body
      : body && typeof body === 'object'
        ? JSON.stringify(body)
        : ''
  return TOKEN_REJECTION_RE.test(text)
}

export type ReauthAction = 'reauth' | 'reset-guard' | 'show-error'

/**
 * Decide what to do after the userinfo/API fetches settle. Pure (no side effects)
 * so it is unit-testable in isolation — the effect below maps the result to the
 * actual storage writes / logIn() / error UI.
 *
 * - 'reauth'      — a token-rejection occurred AND we have not already retried
 *                   this session → clear the token and re-authenticate once.
 * - 'reset-guard' — every fetch succeeded → clear the one-shot guard so a stale
 *                   token later in the same session can self-heal again.
 * - 'show-error'  — a failure we must NOT auto-retry → render the error UI. This
 *                   covers both the loop guard (already retried once) and
 *                   transient / non-token errors (network, 5xx with no JWT signal).
 */
export function planTokenReauth(authErrors: unknown[], alreadyAttempted: boolean): ReauthAction {
  const tokenRejected = authErrors.some(isTokenRejection)
  if (tokenRejected && !alreadyAttempted) return 'reauth'
  if (authErrors.length === 0) return 'reset-guard'
  return 'show-error'
}

// Combined auth context type
export interface AuthContextType extends IAuthContext {
  userInfo: UserInfo | null
  userInfoLoading: boolean
  userInfoError: Error | null
  rpcUserInfo: RpcUserInfo | null
  rpcUserInfoLoading: boolean
  rpcUserInfoError: Error | null
  isAuthReady: boolean
}

// Create the unified auth context
export const AuthContext = createContext<AuthContextType | null>(null)

// Placeholder values that indicate missing configuration
const PLACEHOLDER_PATTERNS = [
  'your-client-id',
  'your-auth-server.com',
  'your-postgrest-api.com',
]

// Check if a value contains any placeholder pattern
function containsPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some(pattern => value.includes(pattern))
}

// Validate OAuth configuration — reads from runtime config
function validateConfig() {
  const missingVars: string[] = []
  const cfg = getConfig()
  const { baseUrl: apiBaseUrl, type: apiType, supabaseApiKey } = getApiConfig()

  if (!cfg.oauthClientId || containsPlaceholder(cfg.oauthClientId)) {
    missingVars.push('VITE_OAUTH_CLIENT_ID')
  }

  if (!cfg.oauthAuthEndpoint || containsPlaceholder(cfg.oauthAuthEndpoint)) {
    missingVars.push('VITE_OAUTH_AUTH_ENDPOINT')
  }

  if (!cfg.oauthTokenEndpoint || containsPlaceholder(cfg.oauthTokenEndpoint)) {
    missingVars.push('VITE_OAUTH_TOKEN_ENDPOINT')
  }

  if (!apiBaseUrl || containsPlaceholder(apiBaseUrl)) {
    missingVars.push('VITE_API_BASE_URL')
  }

  if (apiType === 'supabase') {
    if (!supabaseApiKey || supabaseApiKey.trim() === '') {
      missingVars.push('VITE_SUPABASE_APIKEY (required when VITE_API_TYPE=supabase)')
    }
  }

  return missingVars
}

// Inner component that updates router context and fetches user info when auth changes
function RouterContextUpdater({
  router,
  children
}: {
  router: AnyRouter
  children: ReactNode
}) {
  const oauthContext = useContext(OAuthContext)
  const { token, tokenData } = oauthContext

  // User info state
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [userInfoLoading, setUserInfoLoading] = useState(false)
  const [userInfoError, setUserInfoError] = useState<Error | null>(null)
  const [rpcUserInfo, setRpcUserInfo] = useState<RpcUserInfo | null>(null)
  const [rpcUserInfoLoading, setRpcUserInfoLoading] = useState(false)
  const [rpcUserInfoError, setRpcUserInfoError] = useState<Error | null>(null)
  const [isAuthReady, setIsAuthReady] = useState(false)
  const fetchedTokenRef = useRef<string | null>(null)
  // Latest logIn() without making it an effect dependency (the OAuth lib
  // recreates the function each render). Used by the token self-heal below.
  const logInRef = useRef(oauthContext.logIn)
  logInRef.current = oauthContext.logIn

  useLayoutEffect(() => {
    setInterceptorToken(token || null)

    const isAuthenticated = !!token && !!tokenData && tokenData.exp * 1000 > Date.now()

    router.update({
      context: {
        auth: {
          isAuthenticated: () => isAuthenticated,
          getToken: () => token || null,
        },
      } satisfies RouterContext,
    })

    router.invalidate()
  }, [token, tokenData, router])

  useEffect(() => {
    const fetchUserInfoData = async () => {
      const cfg = getConfig()
      const userinfoEndpoint = cfg.oauthUserinfoEndpoint
      const { baseUrl: apiBaseUrl } = getApiConfig()

      if (!token) {
        setUserInfo(null)
        setRpcUserInfo(null)
        setUserInfoLoading(false)
        setRpcUserInfoLoading(false)
        setIsAuthReady(false)
        fetchedTokenRef.current = null
        return
      }

      if (fetchedTokenRef.current === token) {
        return
      }

      fetchedTokenRef.current = token
      setUserInfoError(null)
      setRpcUserInfoError(null)
      setIsAuthReady(false)

      const shouldFetchOAuthUserInfo = !!userinfoEndpoint
      const shouldFetchRpcUserInfo = !!apiBaseUrl

      setUserInfoLoading(shouldFetchOAuthUserInfo)
      setRpcUserInfoLoading(shouldFetchRpcUserInfo)

      const promises: Promise<boolean>[] = []
      // Raw errors thrown by the fetches below, inspected after they settle to
      // decide whether the token was rejected (→ self-heal) vs a transient error.
      const authErrors: unknown[] = []

      if (shouldFetchOAuthUserInfo) {
        promises.push(
          // Retried BY THE TRANSPORT (the interceptor in lib/apiClient.ts —
          // this is a plain `fetch`), because this endpoint answers 429 when
          // pages load a few seconds apart and the user has done nothing wrong.
          // Without it the rate limit arrives as a terminal error card —
          // observed nineteen times in one accessibility audit run. Do not add
          // a retry here: it would stack on the transport's. See lib/retry.ts.
          fetch(userinfoEndpoint, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
            .then(async (response) => {
              if (!response.ok) {
                // `translate`, not a `useT()` in the effect's deps: listing `t`
                // there would re-run the whole userinfo fetch on a language
                // switch. The message is captured when the request fails, which
                // is the same "already in state" trade every toast makes.
                throw await responseError(translate('Failed to fetch user info'), response)
              }
              const data = await response.json()
              setUserInfo(data)
              return true
            })
            .catch((error) => {
              console.error('Error fetching OAuth user info:', error)
              authErrors.push(error)
              setUserInfoError(error instanceof Error ? error : new Error(translate('Unknown error')))
              setUserInfo(null)
              return false
            })
            .finally(() => {
              setUserInfoLoading(false)
            })
        )
      }

      if (shouldFetchRpcUserInfo) {
        const headersRecord = createApiHeaders(token)

        promises.push(
          // The tenant's serverless PostgREST answers the FIRST request after
          // an idle period with a 404, and a reload fixes it. The transport
          // retries that (a bare 404 under the API base is a cold start; see
          // lib/retry.ts) — this is a plain `fetch` on purpose.
          fetch(`${apiBaseUrl}/rpc/get_userinfo`, {
            method: 'POST',
            headers: headersRecord,
            body: "{}",
          })
            .then(async (response) => {
              if (!response.ok) {
                throw await responseError(translate('Failed to fetch RPC user info'), response)
              }
              const data = await response.json()
              setRpcUserInfo(data)
              return true
            })
            .catch((error) => {
              console.error('Error fetching RPC user info:', error)
              authErrors.push(error)
              setRpcUserInfoError(error instanceof Error ? error : new Error(translate('Unknown error')))
              setRpcUserInfo(null)
              return false
            })
            .finally(() => {
              setRpcUserInfoLoading(false)
            })
        )
      }

      if (promises.length > 0) {
        await Promise.all(promises)
      }

      // Self-heal a rejected token. If the stored token was refused because it
      // can't be verified (e.g. PostgREST "jwk not found" — signed by a key the
      // tenant no longer trusts; the classic symptom of a token left over from a
      // different OAuth provider/build), clear it and re-authenticate ONCE.
      //
      // REAUTH_ATTEMPTED_KEY is the one-shot guard: once set, we do NOT retry —
      // we fall through and show the error UI. This prevents an infinite
      // logout→login loop when the *fresh* token is also rejected (a real,
      // non-transient mismatch rather than mere staleness). It is reset only on a
      // clean success, so genuine staleness later in the session can heal again.
      const action = planTokenReauth(authErrors, !!sessionStorage.getItem(REAUTH_ATTEMPTED_KEY))
      if (action === 'reauth') {
        sessionStorage.setItem(REAUTH_ATTEMPTED_KEY, '1')
        console.error(
          '[auth] Stored access token was rejected during userinfo/API load; ' +
            'clearing it and re-authenticating once.',
          authErrors.filter(isTokenRejection).map((e) => (e as Error).cause),
        )
        // Clear the error state so the boxes don't flash before the redirect.
        setUserInfoError(null)
        setRpcUserInfoError(null)
        // logIn() clearStorage()s the SC_<mode>_ token keys and redirects to the
        // OAuth authorize endpoint — i.e. clear + retry, in a single call.
        logInRef.current()
        return
      }
      if (action === 'reset-guard') {
        sessionStorage.removeItem(REAUTH_ATTEMPTED_KEY)
      }

      setIsAuthReady(true)
    }

    fetchUserInfoData()
  }, [token])

  const combinedContext: AuthContextType = {
    ...oauthContext,
    userInfo,
    userInfoLoading,
    userInfoError,
    rpcUserInfo,
    rpcUserInfoLoading,
    rpcUserInfoError,
    isAuthReady,
  }

  return (
    <AuthContext.Provider value={combinedContext}>
      {children}
    </AuthContext.Provider>
  )
}

export function AuthProviderWrapper({
  router,
  children
}: {
  router: AnyRouter
  children: ReactNode
}) {
  // Validate and build authConfig inside the component — config is guaranteed
  // to be loaded because main.tsx awaits initConfig() before rendering.
  const missingVars = useMemo(() => validateConfig(), [])

  const authConfig = useMemo(() => {
    if (missingVars.length > 0) return null
    const cfg = getConfig()
    return {
      clientId: cfg.oauthClientId,
      authorizationEndpoint: cfg.oauthAuthEndpoint,
      tokenEndpoint: cfg.oauthTokenEndpoint,
      redirectUri: `${window.location.origin}/oauth2_callback`,
      scope: cfg.oauthScope,
      logoutEndpoint: cfg.oauthLogoutEndpoint,
      autoLogin: false,
      postLogin: () => {
        const prefix = `SC_${import.meta.env.MODE}_`
        const t = sessionStorage.getItem(`${prefix}token`) || localStorage.getItem(`${prefix}token`)
        //console.log('[AUTH] token received:', t)
      },
      storageKeyPrefix: `SC_${import.meta.env.MODE}_`,
      extraAuthParameters: {
        audience: cfg.oauthAudience || 'web://api',
      },
      extraTokenParameters: {
        resource: cfg.oauthAudience || 'web://api',
      },
    }
  }, [missingVars])

  if (!authConfig) {
    return <ConfigErrorPage missingVars={missingVars} />
  }

  return (
    <AuthProvider authConfig={authConfig}>
      <RouterContextUpdater router={router}>
        {children}
      </RouterContextUpdater>
    </AuthProvider>
  )
}
