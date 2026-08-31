/**
 * Runtime application configuration.
 *
 * initConfig() is async and must be awaited before the app renders.
 * The control plane is used BY DEFAULT (VITE_CONTROL_PLANE_URL defaults to
 * https://app.semantius.com): tenant config is fetched and merged on top of the
 * VITE_* fallback values. Setting VITE_CONTROL_PLANE_URL to an EXPLICIT empty
 * string opts out (self-hosted): the VITE_* env config is used directly and any
 * blank OAuth endpoints are resolved from VITE_OAUTH_CONFIG (OIDC discovery).
 */

import { runtimeEnv } from './runtimeEnv'
import {
  BACKEND_TYPE_VALUES,
  parseBackendType,
  resolveUserMenu,
  type BackendType,
  type UiCustomizer,
} from './userMenu'

export interface AppConfig {
  // OAuth
  oauthClientId: string
  oauthAuthEndpoint: string
  oauthTokenEndpoint: string
  oauthScope: string
  oauthUserinfoEndpoint?: string
  oauthLogoutEndpoint?: string
  oauthLogoutAPIEndpoint?: string
  oauthLogoutRedirect?: string
  oauthAudience?: string

  // API
  apiBaseUrl: string
  apiType?: string
  supabaseApiKey?: string

  // Cube.js
  cubeApiUrl?: string

  // Tenant (populated when control plane is used)
  tenantId?: string
  tenantName?: string
  tenantLogo?: string | null

  // UI (resolved from VITE_BACKEND_TYPE / VITE_UI_CUSTOMIZER — see lib/userMenu.ts).
  // Required: every AppConfig is built from envFallback(), which seeds both.
  backendType: BackendType
  uiCustomizer: UiCustomizer
}

let _config: AppConfig | null = null
let _configError: string | null = null

/** If initConfig() failed, this holds the error message. */
export function getConfigError(): string | null {
  return _configError
}

// Every VITE_ read goes through runtimeEnv(key, buildTimeValue): window.__ENV__
// (Docker) wins when it holds a real value, else the Vite-inlined build-time
// value is used (dev / Vercel / Cloudflare — unchanged). See lib/runtimeEnv.ts.
function envFallback(): AppConfig {
  return {
    oauthClientId: runtimeEnv('VITE_OAUTH_CLIENT_ID', import.meta.env.VITE_OAUTH_CLIENT_ID) ?? '',
    oauthAuthEndpoint: runtimeEnv('VITE_OAUTH_AUTH_ENDPOINT', import.meta.env.VITE_OAUTH_AUTH_ENDPOINT) ?? '',
    oauthTokenEndpoint: runtimeEnv('VITE_OAUTH_TOKEN_ENDPOINT', import.meta.env.VITE_OAUTH_TOKEN_ENDPOINT) ?? '',
    oauthScope: runtimeEnv('VITE_OAUTH_SCOPE', import.meta.env.VITE_OAUTH_SCOPE) || 'openid profile email',
    oauthUserinfoEndpoint: runtimeEnv('VITE_OAUTH_USERINFO_ENDPOINT', import.meta.env.VITE_OAUTH_USERINFO_ENDPOINT) || undefined,
    oauthLogoutEndpoint: runtimeEnv('VITE_OAUTH_LOGOUT_ENDPOINT', import.meta.env.VITE_OAUTH_LOGOUT_ENDPOINT) || undefined,
    oauthLogoutRedirect: runtimeEnv('VITE_OAUTH_LOGOUT_REDIRECT', import.meta.env.VITE_OAUTH_LOGOUT_REDIRECT) || undefined,
    oauthAudience: runtimeEnv('VITE_OAUTH_AUDIENCE', import.meta.env.VITE_OAUTH_AUDIENCE) || undefined,

    apiBaseUrl: runtimeEnv('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL) ?? '',
    apiType: normaliseApiType(runtimeEnv('VITE_API_TYPE', import.meta.env.VITE_API_TYPE)),
    supabaseApiKey: runtimeEnv('VITE_SUPABASE_APIKEY', import.meta.env.VITE_SUPABASE_APIKEY) || undefined,

    cubeApiUrl: runtimeEnv('VITE_CUBE_API_URL', import.meta.env.VITE_CUBE_API_URL) || undefined,

    // Neutral placeholders. initConfig() overwrites both via applyUiCustomizer()
    // once the tenant slug is known, on every return path.
    backendType: 'cloud',
    uiCustomizer: { user: { menu: [] } }
  }
}

/**
 * Extract tenant name from the current URL.
 * When VITE_CONTROL_PLANE_ORG is set, that value is used directly
 * instead of parsing the subdomain from the hostname.
 * e.g. http://test.adenin.com/foo → "test"
 *      http://localhost:1234/bar  → "localhost"
 */
function getTenantName(): string {
  const org = (runtimeEnv('VITE_CONTROL_PLANE_ORG', import.meta.env.VITE_CONTROL_PLANE_ORG) ?? '').trim()
  if (org) return org
  const parts = window.location.hostname.split('.')
  return parts[0]
}

interface TenantResponse {
  id: string
  client_id: string
  name: string
  logo: string | null
  postgrest_url: string
}


function buildOAuthUrls(slug: string) {
  const CONNECT_BASE = `https://${slug}.semantius.cloud`
  const base = `${CONNECT_BASE}/api/auth/oauth2`
  return {
    oauthAuthEndpoint: `${base}/authorize`,
    oauthTokenEndpoint: `${base}/token`,
    oauthUserinfoEndpoint: `${base}/userinfo`,
    // oauthLogoutEndpoint: `${base}/end-session`,
  }
}

/**
 * Load configuration. Must be awaited before the app renders.
 * When VITE_CONTROL_PLANE_URL is set, fetches tenant config and merges it.
 * On failure, records the error (retrievable via getConfigError()).
 */
export async function initConfig(): Promise<AppConfig> {
  const cfg = await initConfigCore()
  // The user menu is resolved LAST, in a wrapper rather than inside the core:
  // initConfigCore() has seven return paths and the resolution needs the tenant
  // slug, which only the last of them knows. `cfg` is the very object held in
  // `_config`, so mutating it in place is what getConfig() will hand out.
  applyUiCustomizer(cfg)
  return cfg
}

async function initConfigCore(): Promise<AppConfig> {
  _configError = null
  const fallback = envFallback()

  // Capability precheck, before any endpoint is resolved or any login offered.
  // validateConfig() (AuthContext) only asks whether the OAuth *values* are
  // present; this asks whether the browser can actually PERFORM the flow.
  const insecure = secureContextError()
  if (insecure) {
    _configError = insecure
    _config = fallback
    return _config
  }

  // The control plane is opt-OUT, not opt-in. VITE_CONTROL_PLANE_URL is only
  // defaulted when UNSET (undefined); an EXPLICIT empty string ("") is the
  // self-hosted opt-out.
  //
  // NOTE: do NOT key the self-hosted branch off `fallback.apiBaseUrl`. Dev's
  // .env.local sets VITE_API_BASE_URL (Neon) yet must still resolve OAuth via
  // the control plane (its VITE_OAUTH_* values are only fallbacks), so a truthy
  // apiBaseUrl is NOT a valid "self-hosted" signal — using it there sent dev to
  // the test-oidc-server instead of <org>.semantius.cloud.
  const rawControlPlaneUrl = runtimeEnv('VITE_CONTROL_PLANE_URL', import.meta.env.VITE_CONTROL_PLANE_URL)
  const controlPlaneUrl = (rawControlPlaneUrl ?? 'https://app.semantius.com').trim()

  // Self-hosted path: no control plane configured. Trust the VITE_* env config
  // and fill any blank OAuth endpoint from the OIDC discovery document
  // (VITE_OAUTH_CONFIG). A failed discovery records _configError → blocks boot.
  if (!controlPlaneUrl) {
    const rawScope = (runtimeEnv('VITE_OAUTH_SCOPE', import.meta.env.VITE_OAUTH_SCOPE) ?? '').trim()
    await applyOidcDiscovery(fallback, rawScope)
    _config = fallback
    return _config
  }

  if (controlPlaneUrl) {
    const tenantName = getTenantName()
    const url = `https://api.semantius.cloud/organization/${encodeURIComponent(tenantName)}`

    try {
      const res = await fetch(url)
      if (!res.ok) {
        if (res.status === 404 && tenantName === 'www') {
          window.location.replace('https://www.semantius.com')
          _config = fallback
          return _config
        }
        _configError = `Tenant lookup failed: ${res.status} ${res.statusText} (${url})`
        _config = fallback
        return _config
      }

      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        _configError = `Tenant lookup returned unexpected content-type: ${contentType} (${url})`
        _config = fallback
        return _config
      }

      const tenant: TenantResponse = await res.json()

      const missing = (['id', 'name', 'postgrest_url', 'client_id'] as const)
        .filter((k) => !tenant[k])
      if (missing.length > 0) {
        _configError = `Tenant response is missing required fields: ${missing.join(', ')} (${url})`
        _config = fallback
        return _config
      }

      const oauthUrls = buildOAuthUrls(tenant.name)

      _config = {
        ...fallback,
        ...oauthUrls,
        oauthClientId: tenant.client_id || fallback.oauthClientId,
        oauthScope: 'openid profile email',
        oauthLogoutAPIEndpoint: `${controlPlaneUrl.replace(/\/+$/, '')}/api/logout`,
        apiBaseUrl: tenant.postgrest_url || fallback.apiBaseUrl,
        cubeApiUrl: runtimeEnv('VITE_CUBE_API_URL', import.meta.env.VITE_CUBE_API_URL) || `https://${tenant.name}.semantius.io`,
        oauthAudience: "tenant://" + tenant.id,
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantLogo: tenant.logo,
      }

      return _config

    } catch (err) {
      _configError = `Tenant lookup failed: ${err instanceof Error ? err.message : String(err)} (${url})`
      _config = fallback
      return _config
    }
  }

  _config = fallback
  return _config
}

/**
 * PKCE needs WebCrypto (`crypto.subtle.digest` for the S256 challenge), and
 * browsers withhold `crypto.subtle` outside a secure context — HTTPS, or the
 * `localhost` / `127.0.0.1` exemption. Reaching a plain-HTTP deployment over a
 * LAN IP (`http://192.168.x.x:3000`) therefore makes login impossible.
 *
 * This tests the capability rather than inferring it from scheme + hostname, so
 * it cannot false-positive behind a reverse proxy, in any deployment shape, or
 * under `vite dev`: if the API is there, the flow can run.
 *
 * Recorded as a config error so boot stops at the existing screen in main.tsx
 * BEFORE a login is attempted — otherwise logIn() fails after the app has
 * committed to redirecting, which is invisible unless a route branches on
 * useAuth().error.
 */
function secureContextError(): string | null {
  if (typeof window === 'undefined') return null
  if (window.isSecureContext && window.crypto?.subtle) return null
  return (
    `This origin (${window.location.origin}) is not a secure context, so the browser ` +
    `withholds crypto.subtle — the WebCrypto API the PKCE login flow requires. ` +
    `Serve the app over HTTPS, or reach it at http://localhost.`
  )
}

/**
 * OIDC discovery. When VITE_OAUTH_CONFIG (a `.well-known/openid-configuration`
 * URL) is set, fetch it and fill any OAuth endpoint/scope that was NOT provided
 * explicitly via VITE_OAUTH_*. Explicit env values always win — discovery only
 * supplies the blanks.
 *
 * This replaces the old shell-side discovery in docker/gen-config.sh (curl+jq at
 * container start): the container now passes plain env vars and the app resolves
 * endpoints uniformly across dev / Vercel / Cloudflare / Docker. IdPs serve the
 * discovery document with permissive CORS, so a browser fetch is fine.
 *
 * A failed fetch records _configError; main.tsx turns any config error into a
 * blocking boot screen, so a broken VITE_OAUTH_CONFIG never silently degrades.
 */
async function applyOidcDiscovery(cfg: AppConfig, rawScope: string): Promise<void> {
  const url = (runtimeEnv('VITE_OAUTH_CONFIG', import.meta.env.VITE_OAUTH_CONFIG) ?? '').trim()
  if (!url) return

  let doc: {
    authorization_endpoint?: string
    token_endpoint?: string
    userinfo_endpoint?: string
    end_session_endpoint?: string
    scopes_supported?: string[] | string
  }
  try {
    const res = await fetch(url)
    if (!res.ok) {
      _configError = `OIDC discovery failed: ${res.status} ${res.statusText} (${url})`
      return
    }
    doc = await res.json()
  } catch (err) {
    _configError = `OIDC discovery failed: ${err instanceof Error ? err.message : String(err)} (${url})`
    return
  }

  // Fill only the blanks — an explicit VITE_OAUTH_* value already in cfg wins.
  if (!cfg.oauthAuthEndpoint) cfg.oauthAuthEndpoint = doc.authorization_endpoint ?? ''
  if (!cfg.oauthTokenEndpoint) cfg.oauthTokenEndpoint = doc.token_endpoint ?? ''
  if (!cfg.oauthUserinfoEndpoint) cfg.oauthUserinfoEndpoint = doc.userinfo_endpoint || undefined
  if (!cfg.oauthLogoutEndpoint) cfg.oauthLogoutEndpoint = doc.end_session_endpoint || undefined
  if (!rawScope) cfg.oauthScope = deriveScope(doc.scopes_supported)
}

/**
 * Resolve the configurable user menu from VITE_BACKEND_TYPE / VITE_UI_CUSTOMIZER
 * and store it on the config. Runs once at init, AFTER the tenant fetch, so the
 * `{orgid}` placeholder is substituted here and the stored URLs are concrete.
 *
 * A bad backend type or an unparseable customizer records _configError, which
 * main.tsx turns into a blocking boot screen — the same convention a broken
 * VITE_OAUTH_CONFIG follows. It never CLOBBERS an existing error, though: a
 * tenant-lookup or OIDC-discovery failure is the more useful thing to report.
 */
function applyUiCustomizer(cfg: AppConfig): void {
  const rawBackendType = runtimeEnv('VITE_BACKEND_TYPE', import.meta.env.VITE_BACKEND_TYPE)
  const rawCustomizer = runtimeEnv('VITE_UI_CUSTOMIZER', import.meta.env.VITE_UI_CUSTOMIZER)

  const backendType = parseBackendType(rawBackendType)
  if (!backendType) {
    recordConfigError(`Invalid VITE_BACKEND_TYPE: "${rawBackendType}". Valid values are: ${BACKEND_TYPE_VALUES}.`)
    return
  }
  cfg.backendType = backendType

  // On the cloud path cfg.tenantName is the org slug; on the self-hosted path
  // (and on any early return) it is undefined, so `{orgid}` collapses to an
  // empty string rather than leaking the literal placeholder into a URL.
  const resolved = resolveUserMenu(backendType, rawCustomizer, cfg.tenantName)
  if ('error' in resolved) {
    recordConfigError(resolved.error)
    return
  }
  cfg.uiCustomizer = { user: { menu: resolved.menu } }
}

/** Record `message` only if nothing earlier already failed (first error wins). */
function recordConfigError(message: string): void {
  if (_configError === null) _configError = message
}

/** Mirror the old gen-config.sh scope logic: prefer the standard trio when the
 *  IdP advertises `openid`, else the advertised scopes, else the standard trio. */
function deriveScope(scopesSupported: string[] | string | undefined): string {
  const scopes = Array.isArray(scopesSupported)
    ? scopesSupported
    : typeof scopesSupported === 'string'
      ? scopesSupported.split(/\s+/).filter(Boolean)
      : []
  if (scopes.includes('openid')) return 'openid profile email'
  if (scopes.length > 0) return scopes.join(' ')
  return 'openid profile email'
}

/** Get the current config. Throws if initConfig() has not been awaited. */
export function getConfig(): AppConfig {
  if (!_config) {
    throw new Error('App config not initialised — await initConfig() before rendering')
  }
  //console.log('Using app config:', _config)
  return _config
}

function normaliseApiType(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.toLowerCase()
  }
  return undefined
}
