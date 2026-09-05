/**
 * The route matrix, and how the parameterised ones are resolved.
 *
 * Seven of the app's routes carry params (`$moduleId`, `$table_name`, `$key`,
 * `$id`). Guessing values produces 404 pages that sweep clean and prove nothing,
 * so they are resolved live against the same PostgREST endpoint the app uses,
 * with the same token.
 */

/** Viewports. 320 is the 1.4.10 reflow floor; 844x390 is landscape phone. */
export const VIEWPORTS = [
  { name: '320', width: 320, height: 640 },
  { name: '390', width: 390, height: 844 },
  { name: '640', width: 640, height: 800 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
  // Landscape phone. use-mobile.ts flips on WIDTH, so at 844px wide this gets the
  // desktop sidebar inside 390px of height — a case a portrait-only matrix cannot
  // see (1.3.4 Orientation).
  { name: '844x390-landscape', width: 844, height: 390 },
]

export const THEMES = ['light', 'dark']

/**
 * Routes that are deliberately NOT swept, and why. Stating them here rather than
 * quietly omitting them is what keeps "zero violations" from being a claim about
 * pages nobody looked at.
 */
export const EXCLUDED = [
  { path: '/logout', reason: 'performs a side effect and redirects; has no steady state to measure' },
  { path: '/oauth2_callback', reason: 'only reachable mid-OAuth with a live authorization code' },
  { path: '/form-playground', reason: 'developer tool, explicitly out of scope' },
]

/**
 * Resolve the parameterised routes against live data.
 *
 * `fetchJson` is injected so this stays testable and so the caller owns the token.
 */
export async function resolveRoutes({ apiBaseUrl, token, fetchImpl = fetch }) {
  const get = async (path) => {
    const res = await fetchImpl(`${apiBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`)
    return res.json()
  }

  const modules = await get('/modules?select=id,module_name,module_slug,home_page&order=id')
  // Prefer a content module over the `_core` admin one: it has richer pages, and
  // a sweep of the admin module alone would miss the grids most users see.
  const demoModule =
    modules.find((m) => m.module_slug && m.module_slug !== 'admin') ?? modules[0]
  if (!demoModule) throw new Error('no modules available to resolve routes against')

  const entities = await get(
    `/entities?select=table_name,plural_label&module_id=eq.${demoModule.id}&order=table_name&limit=50`,
  )
  // A table with a plain integer `id` keeps the record route simple; `customers`
  // is the canonical one in the nwind sample set.
  const entity =
    entities.find((e) => e.table_name === 'customers') ?? entities[0]
  if (!entity) throw new Error(`module ${demoModule.module_slug} exposes no entities`)

  const rows = await get(`/${entity.table_name}?select=id&order=id&limit=1`)
  const recordId = rows[0]?.id
  if (recordId === undefined) {
    throw new Error(`${entity.table_name} has no rows; cannot resolve a record route`)
  }

  const m = demoModule.module_slug
  const t = entity.table_name

  return {
    resolution: { moduleSlug: m, tableName: t, recordId },
    routes: [
      { id: 'index', path: '/', name: 'Modules' },
      { id: 'module-home', path: `/${m}`, name: 'Module home' },
      { id: 'entity-list', path: `/${m}/${t}`, name: 'Entity list' },
      { id: 'entity-record', path: `/${m}/${t}/${recordId}`, name: 'Record' },
      { id: 'entity-record-view', path: `/${m}/${t}/${recordId}/view`, name: 'Record (view)' },
      { id: 'crm-home', path: '/crm/home', name: 'CRM home' },
      { id: 'crm-home-detail', path: '/crm/home/detail', name: 'CRM home detail' },
      { id: 'documents', path: '/documents', name: 'Documents' },
      { id: 'settings', path: '/settings', name: 'Settings' },
      { id: 'xcustomers', path: '/xcustomers', name: 'Customers (demo)' },
      { id: 'xcustomers-new', path: '/xcustomers/new', name: 'New customer' },
      { id: 'xcustomers-record', path: '/xcustomers/1', name: 'Customer record' },
      { id: 'xcustomers-edit', path: '/xcustomers/1/edit', name: 'Edit customer' },
      { id: 'login', path: '/login', name: 'Sign in', unauthenticated: true },
      { id: 'logout-success', path: '/logout-success', name: 'Signed out', unauthenticated: true },
      { id: 'not-found', path: '/this-route-does-not-exist', name: 'Not found' },
    ],
  }
}
