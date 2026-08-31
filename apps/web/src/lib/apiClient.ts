/**
 * Centralized API configuration
 * 
 * This module provides a single source of truth for API-related configuration
 * including base URL, API type, and provider-specific keys.
 */

import { type EntityMetadata } from "@/types/metadata"
import { getConfig, tryGetConfig } from "@/lib/config"

// --- Fetch interceptor ---
// Module-level token store for the fetch interceptor
let _currentToken: string | null = null

/** Update the token used by the fetch interceptor */
export function setInterceptorToken(token: string | null) {
  _currentToken = token
}

const _originalFetch = globalThis.fetch

/**
 * Intercepted fetch: relative URLs (starting with "/") are prefixed with
 * VITE_API_BASE_URL and automatically receive authorization headers from
 * createApiHeaders(). Absolute URLs pass through unchanged.
 *
 * Before initConfig() has resolved, relative URLs ALSO pass through unchanged.
 * This interceptor exists to route API calls, and before the config exists
 * there are no API calls to route — the app does not render until initConfig()
 * resolves. What there IS pre-init is initConfig()'s own OIDC discovery fetch,
 * and an interceptor that consulted getConfig() here turned that fetch into a
 * blocked boot ("App config not initialized") on every deployment whose
 * VITE_OAUTH_CONFIG was origin-relative. Never throw from this function: a
 * fetch wrapper that can fail for reasons unrelated to the request breaks
 * callers that correctly handle network errors.
 */
globalThis.fetch = function interceptedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url

  // Only intercept relative paths (starting with "/")
  if (url.startsWith('/')) {
    const cfg = tryGetConfig()
    if (!cfg) return _originalFetch(input, init)
    const baseUrl = cfg.apiBaseUrl
    // Strip trailing slash from baseUrl to avoid double slashes
    const cleanBase = baseUrl.replace(/\/+$/, '')
    // Most call sites already build `${apiBaseUrl}/path` themselves. When baseUrl
    // is ABSOLUTE (http…) that result doesn't start with "/" and never reaches
    // here — one prefix, correct. But when baseUrl is RELATIVE (e.g. "/api", for
    // same-origin proxying) the call site's URL already starts with "/api", so
    // prefixing again would double it → "/api/api/…". Guard against that: if the
    // URL is already under a relative base, treat it as resolved.
    const alreadyPrefixed =
      cleanBase.startsWith('/') && (url === cleanBase || url.startsWith(cleanBase + '/'))
    const resolvedUrl = alreadyPrefixed ? url : cleanBase + url

    if (_currentToken) {
      const authHeaders = createApiHeaders(_currentToken)
      const existingHeaders = init?.headers
      const merged = new Headers(existingHeaders)
      // Auth headers are set only if not already provided by the caller
      for (const [key, value] of Object.entries(authHeaders)) {
        if (!merged.has(key)) {
          merged.set(key, value)
        }
      }
      return _originalFetch(resolvedUrl, { ...init, headers: merged })
    }

    return _originalFetch(resolvedUrl, init)
  }

  return _originalFetch(input, init)
}

export interface ApiConfig {
  baseUrl: string
  type?: string
  supabaseApiKey?: string
}

/**
 * Get API configuration from runtime config
 *
 * @returns API configuration object
 */
export function getApiConfig(): ApiConfig {
  const cfg = getConfig()
  return {
    baseUrl: cfg.apiBaseUrl,
    type: cfg.apiType,
    supabaseApiKey: cfg.supabaseApiKey,
  }
}

/**
 * Create HTTP headers for API requests with proper authentication
 * 
 * @param token - OAuth Bearer token
 * @param options - Optional configuration overrides
 * @returns Headers object ready for fetch requests
 * 
 * @example
 * const headers = createApiHeaders(token)
 * fetch(url, { headers })
 * 
 * @example
 * // Override default config
 * const headers = createApiHeaders(token, { 
 *   baseUrl: 'https://custom-api.com',
 *   type: 'supabase',
 *   supabaseApiKey: 'custom-key'
 * })
 */
export function createApiHeaders(
  token: string,
  options?: Partial<ApiConfig>
): Record<string, string> {
  const config = options ? { ...getApiConfig(), ...options } : getApiConfig()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }

  // Add Supabase-specific apikey header if API_TYPE is supabase
  if (config.type === 'supabase' && config.supabaseApiKey) {
    headers['apikey'] = config.supabaseApiKey
  }

  return headers
}

const SCHEMA_CACHE_TABLES = new Set(['entities', 'fields'])

/**
 * Notify the tenant's schema cache endpoint to refresh after data mutations.
 * Only fires for tables that affect the schema (entities, fields).
 * Uses the absolute semantius.cloud URL (not intercepted), so the token is passed explicitly.
 */
export async function refreshSchemaCache(token: string, tenantName: string | undefined, tableName: string): Promise<void> {
  if (!tenantName || !SCHEMA_CACHE_TABLES.has(tableName)) return
  const url = `https://${tenantName}.semantius.cloud/refresh-schema-cache`
  try {
    await _originalFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: '{}',
    })
  } catch {
    // Non-fatal — schema cache refresh failure should not block the UI
  }
}

/**
 * Call a PostgREST RPC function
 * DRY utility for all RPC calls - can be used in loaders and non-React contexts
 * 
 * @param rpcName - Name of the RPC function
 * @param params - Parameters to pass to the RPC function
 * @param token - Authentication token
 * @returns Promise with the RPC response
 * 
 * @example
 * const result = await callRpc('get_schema', { p_table_name: 'products' }, token)
 */
export async function callRpc<TResult = unknown, TParams = Record<string, unknown>>(
  rpcName: string,
  params: TParams,
  token: string
): Promise<TResult> {
  const { baseUrl: apiBaseUrl } = getApiConfig()
  const headers = createApiHeaders(token)

  const response = await fetch(`${apiBaseUrl}/rpc/${rpcName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params)
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `Failed to call RPC function "${rpcName}"`
    
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.message || errorJson.error || errorText
    } catch {
      errorMessage = errorText || errorMessage
    }
    
    throw new Error(errorMessage)
  }

  return await response.json() as TResult
}

/**
 * Feature flag controlling how foreign-key label values are fetched.
 *
 * - `false` (current behavior): embed the referenced row via PostgREST resource
 *   embedding and extract the label from the nested object at render time, e.g.
 *   `category_id_label:category_id(category_name)` returns
 *   `{ category_id_label: { category_name: "Tools" } }`.
 * - `true` (new behavior): the database now exposes a generated `<fk>_label`
 *   function / computed column that returns the label string directly, so the
 *   select only needs to request `category_id_label` and no nested-object
 *   handling is required (`{ category_id_label: "Tools" }`).
 *
 * Kept as a toggle so the old query-time embedding stays available until the
 * generated columns are confirmed to work in all aspects. Consumed here (query
 * side) and by the grid cell renderers in DataTableView/TableView (render side),
 * so all three must read the same flag to stay in sync.
 *
 * Typed as `boolean` (not the inferred `false` literal) so flipping it to `true`
 * does not make either branch look like dead code to the type-checker.
 */
export const AUTO_LABEL: boolean = true

/**
 * Build PostgREST select clause with embedded resources for foreign key references
 *
 * Analyzes entity metadata to detect reference fields (foreign keys) and builds
 * a select clause that includes embedded resources using PostgREST's resource embedding.
 * 
 * For example, if a 'category_id' field references 'product_categories' table,
 * the select will include: category_id,category_id_label:category_id(category_name)
 * This creates a separate field with _label suffix containing the referenced label value.
 *
 * @param metadata - Entity metadata containing schema with reference field information
 * @param autoLabel - Whether to request the DB-generated `<fk>_label` column directly
 *   (true) instead of the legacy query-time embed (false). Defaults to {@link AUTO_LABEL};
 *   exposed as a parameter so both paths can be unit-tested.
 * @returns PostgREST select parameter string (e.g., "id,name,category_id,category_id_label")
 *
 * @example
 * const select = buildPostgRESTSelect(productMetadata)
 * // AUTO_LABEL on:  "id,product_name,category_id,category_id_label,..."
 * // AUTO_LABEL off: "id,product_name,category_id,category_id_label:category_id(category_name),..."
 */
export function buildPostgRESTSelect(metadata: EntityMetadata, autoLabel: boolean = AUTO_LABEL): string {
  const selects: string[] = []
  
  if (!metadata.properties) {
    return '*'
  }
  
  // Iterate through all properties to build select clause
  for (const [fieldName, property] of Object.entries(metadata.properties)) {
    // Skip synthetic label companions that get_schema now emits as properties
    // (ctype 'fk_label' / '_label'). They must not be selected on their own:
    // a reference field adds its own label below (embedded in the legacy path,
    // or as the generated <fk>_label column when AUTO_LABEL is on), and selecting
    // the bare companion alongside the embed would collide on the same output key.
    // The row-level _label is unused by the grids.
    if (property.ctype === 'fk_label' || property.ctype === '_label') continue

    // Always include the field itself (the ID)
    selects.push(fieldName)
    
    // If field has a foreign key reference, add aliased embedded resource.
    // Use PostgREST's FK-column embed form: alias:fk_column(label_column).
    // Embedding by FK column (rather than table!fk hint) disambiguates
    // self-joins and multiple FKs to the same table without PGRST201.
    if (property.reference_table && property.reference_table_label_column) {
      if (autoLabel) {
        // DB-generated function / computed column returns the label string
        // directly, so request it as a plain column (no embedding).
        selects.push(`${fieldName}_label`)
      } else {
        selects.push(`${fieldName}_label:${fieldName}(${property.reference_table_label_column})`)
      }
    }
  }
  
  return selects.join(',')
}
