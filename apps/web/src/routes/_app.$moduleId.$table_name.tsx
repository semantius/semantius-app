// routes/$moduleId.$table_name.$key.tsx
import { createFileRoute, notFound, useParams } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'
import { statusOf } from '@/lib/retry'
import { lazy, Suspense, useMemo } from 'react'
import { NotFoundPage } from '@/components/NotFoundPage'
import { ViewSkeleton } from '@/components/ViewSkeleton'
import type { EntityMetadata } from '@/types/metadata'
import { translate, useT } from '@/i18n'

// Discover all view components - lazy load for code splitting
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const viewComponents = import.meta.glob<Record<string, React.ComponentType<any>>>(
  '../components/views/**/*.{tsx,jsx}',
  { eager: false }
)

// Cache for lazy components to prevent recreation
const lazyComponentCache = new Map<string, React.ComponentType<any>>()

export const Route = createFileRoute('/_app/$moduleId/$table_name')({
  shouldReload: false, // Never reload - metadata doesn't change
  loader: async ({ params, context }) => {
    const { table_name } = params
    const token = context.auth.getToken()
    
    // Not-found ONLY when the server said the table is not there. Anything
    // else — a rate limit or cold start that outlasted the retry budget, a
    // network error, a 403 — is thrown, and lands on the router's
    // defaultErrorComponent with a Try Again that re-runs this loader. This
    // loader used to catch everything and answer notFound(), which told a
    // rate-limited user the table did not exist.
    const metadata = await fetchEntityMetadata(table_name, token)
    if (!metadata) {
      throw notFound()
    }

    return { metadata }
  },
  // Titled from the entity's own plural label rather than the raw table name —
  // the loader has already fetched the metadata by the time head() runs, so this
  // costs nothing. Falls back to the table name if metadata ever lacks a label.
  // `loaderData` is cast rather than inferred on purpose: referencing the
  // inferred loader type from inside the same route definition is circular, and
  // TypeScript resolves the cycle by widening loaderData to `never` — which then
  // breaks Route.useLoaderData() in the component too.
  head: ({ loaderData, params }) => {
    const data = loaderData as { metadata?: EntityMetadata } | undefined
    return {
      meta: [
        { title: pageTitle(data?.metadata?.table?.plural_label || params.table_name) },
      ],
    }
  },
  component: RouteComponent,
  // Show the content-area skeleton while the blocking loader runs, instead of
  // holding the previous page. pendingMs keeps fast/cached navigations flash-
  // free; the explicit pendingMinMs: 0 overrides the router's 500ms default,
  // which would otherwise keep the skeleton up after the data had arrived.
  // pendingComponent receives no props, so metadata only reaches the inner
  // Suspense fallback below.
  pendingComponent: ViewSkeleton,
  pendingMs: 300,
  pendingMinMs: 0,
  notFoundComponent: NotFoundPage,
})

function RouteComponent() {
  const t = useT()
  const { moduleId, table_name, key } = useParams({ strict: false })
  const { metadata } = Route.useLoaderData()
  
  // Get or create lazy component (cached to prevent Suspense flickering on key changes)
  const Component = useMemo(() => {
    if (!table_name) return null
    
    const componentName = table_name.charAt(0).toUpperCase() + table_name.slice(1)
    const specificComponentPath = `../components/views/${moduleId}/${componentName}.tsx`
    const genericComponentPath = '../components/views/View.tsx'
    
    const componentPath = specificComponentPath in viewComponents 
      ? specificComponentPath 
      : genericComponentPath
    
    if (!lazyComponentCache.has(componentPath)) {
      lazyComponentCache.set(
        componentPath,
        lazy(() => 
          viewComponents[componentPath]().then(m => ({ 
            default: m[componentName] || m.View || m.default 
          }))
        )
      )
    }
    
    return lazyComponentCache.get(componentPath)!
  }, [table_name, moduleId])
  
  if (!Component) {
    return <div>{t('Invalid table name')}</div>
  }
  
  return (
    <Suspense fallback={<ViewSkeleton metadata={metadata} />}>
      {/* key on table_name remounts the view when switching tables. Without it
          the SAME generic View instance is reused across tables (same route,
          changed params), so its internal state and useTable's keep-previous
          placeholder data bleed across tables — showing the previous table's
          rows/row-count until the new query resolves. The key is table_name (not
          page/sort), so pagination/sort/filter WITHIN a table keep the instance
          and its smooth keep-previous behavior. The lazy component is cached and
          already resolved, so the remount does not re-trigger Suspense. */}
      <Component key={table_name} table_name={table_name} metadata={metadata} moduleId={moduleId} recordId={key} />
    </Suspense>
  )
}

/**
 * Fetch entity metadata using the get_schema RPC function
 * This follows the PostgREST RPC pattern for calling stored procedures.
 *
 * Resolves `null` only for a 404 — `get_schema` answers one, with PostgREST's
 * own error body, for a table that is not in `entities`. Every other failure is
 * rethrown, status on `cause`, so the caller can show an error rather than a
 * 404 page. The retrying (a bounded budget, cold-start 404s included) already
 * happened in the fetch interceptor by the time a rejection reaches here.
 */
async function fetchEntityMetadata(
  table_name: string,
  token: string | null,
): Promise<EntityMetadata | null> {
  if (!token) {
    // `translate`: a route loader runs outside React.
    throw new Error(translate('Authentication token is required'))
  }

  const { callRpc } = await import('@/lib/apiClient')
  try {
    return await callRpc<EntityMetadata>('get_schema', { p_table_name: table_name }, token)
  } catch (err) {
    if (statusOf(err) === 404) return null
    throw err
  }
}